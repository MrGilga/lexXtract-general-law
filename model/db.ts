import { LocalStored } from "./helpers"
import {  type JsonData } from "./types"
import { DbConnection, type ErrorContext, type SubscriptionEventContext } from "./module_bindings"
import { fill, validate, type Pattern } from "./pattern"
import { hash } from "./hash"



export type Stored <T extends JsonData> = {
  key:string,
  pattern: Pattern,
  get: ()=> T,
  set: (data:T)=>void,
  onupdate: (listener:()=>void)=>void
  update: (updater: (data:T)=>T | Promise<T> | void) => void
}

export type DB = {
  signup(arg: {userid:string, passhash:string}):Promise<void>
  userid: string,
  changePassword(newPassword:string):Promise<void>
  disconnect(): void
  get<T extends JsonData>(key:string, pattern:Pattern, args?:
    {
      owner?:string,
      defaultValue?:T,
      upsertVal?: T
    },
  ): Promise<Stored<T>>
  saving: number,
}

let rand = (digits:number) => Math.floor(Math.random()*10**digits).toString().padStart(digits, "0")
const mkkey = (owner:string, key:string) => owner.replaceAll(":", "_:") + ":" + key

export type User = {userid: string, passhash: string}
export const User:Pattern = {
  userid: String,
  passhash: String,
}

export const randUser = ()=>({userid: 'u' + rand(4), passhash: hash(rand(6))})



export const RemoteDB = async ():Promise<DB> => new Promise((res,err)=>{
  DbConnection.builder()
  .withUri("wss://maincloud.spacetimedb.com/lexxtract")
  .withDatabaseName("lexxtract")
  .onConnect((c)=>{
    let localUser = LocalStored<User>("current_user_remote_hashed", User, randUser())
    let pwd = ()=> localUser.get().passhash

    const signup = async (args:{userid:string, passhash:string}) => {
      let res = await c.procedures.signup(args)
      if (res.tag == "Success"){
        localUser.set(args)
        db.userid = args.userid
      }else throw new Error("error signing up")
    }

    function _get(owner:string, key:string): Promise<JsonData | undefined>{
      return new Promise((rs, rj)=>{
        let sub = c.subscriptionBuilder()
        .onApplied((c: SubscriptionEventContext)=>{
          let r= c.db.storage.owner_key.find(mkkey(owner, key))
          if (!r) return rs(undefined)
          sub.unsubscribe()
          rs(JSON.parse(r.value))
        })
        .onError((e: ErrorContext)=>{
          console.error("DB subscription error", e.event ?? e)
          sub.unsubscribe()
          rj(e.event ?? new Error("Unknown DB subscription error"))
        })
        .subscribe(`select * from storage where owner_key = '${mkkey(owner, key)}'`)
      })
    }


    const hot_cache = new Map<string, Stored<JsonData>>()

    function mkStored<T extends JsonData>(key:string, pattern:Pattern, value:T, owner?:string): Stored<T>{
      try{ validate(pattern, value) }
      catch(e){ value = fill(pattern) as T }

      let cacheS = JSON.stringify(value)

      const listeners: (()=>void)[] = []
      const set = async (data:T) =>{
        let newS = JSON.stringify(data)
        if (cacheS== newS){return}
        console.log("setting new value for", owner ?? db.userid, key, "new value:", data)
        validate(pattern, data)
        value = data as T
        cacheS = newS
        listeners.forEach(l=>l())
        db.saving++;
        await c.procedures.setitem({owner: owner ?? db.userid, passhash: pwd(), key, value: JSON.stringify(data)})
        .then((r)=>{
          db.saving--;
          if (r.tag != "Success"){throw new Error("Failed to set item in DB: " + JSON.stringify(r))}
        })
      }
      
      let res :Stored<T> = {
        key,
        pattern,
        get: ()=>value,
        set,
        update: async x=> {
          let p = await x(value)
          if (p!=undefined) set(p)
        },
        onupdate: f=>{listeners.push(f)}
      }

      hot_cache.set(mkkey(owner ?? db.userid, key), res as any as Stored<JsonData>)

      return res
    }

    const get = async <T extends JsonData> (key:string, pattern:Pattern, args: {owner?:string, upsertValue?: T, defaultValue?:T} = {}) => {
      let owner = args.owner || db.userid
      let owner_key = mkkey(owner, key)
      if (!hot_cache.has(owner_key)){
        let value = args.upsertValue != undefined ? null : await _get(owner, key).then(v=> v ?? args.defaultValue ?? null) as T
        hot_cache.set(owner_key, mkStored(key, pattern, value, owner) as any as Stored<JsonData>)
      }
      let res = hot_cache.get(owner_key)! as any as Stored<T>
      if (args.upsertValue != undefined) {
        console.log("upserting value for", owner, key, "value:", args.upsertValue)
        res.set(args.upsertValue)}
      return res
    }

    let db:DB = {
      userid: localUser.get().userid,
      saving:0,
      
      signup,
      disconnect() {
        c.disconnect()
      },
      async changePassword(newPassword: string) {
        let newhash = hash(newPassword)
        let res = await c.procedures.changePassword({userid: db.userid, passhash:pwd(), newPasshash: newhash})
        if (res.tag != "Success") throw new Error("Failed to change password")
        signup({userid: db.userid, passhash: newhash})
      },
      get
    }
    db.signup(localUser.get()).then(()=>res(db))
    .catch(()=>{
      db.signup(randUser())
    })
  })
  .onConnectError((_ctx: ErrorContext, e: Error)=>{
    console.error("Failed to connect to DB", e)
    err(e)
  })
  .build()
})
