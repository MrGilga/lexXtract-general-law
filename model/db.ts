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

    // async function get<T extends JsonData>  (key: string, pattern: Pattern, owner?: string) {
    //   owner ||= db.userid
    //   let owner_key = mkkey(owner, key)
    //   if (!hot_cache.has(owner_key)){
    //     // let cache:T = await new Promise<T>((rs, rj)=>{
    //     //   let sub = c.subscriptionBuilder()
    //     //   .onApplied((c: SubscriptionEventContext)=>{
    //     //     let r= c.db.storage.owner_key.find(owner_key)
    //     //     if (!r) return rs(fill(pattern) as T)
    //     //     let val = JSON.parse(r.value) as T
    //     //     try{validate(pattern, val)
    //     //     }catch(e){
    //     //       val = fill(pattern) as T
    //     //     }
    //     //     sub.unsubscribe()
    //     //     rs(val)
    //     //   })
    //     //   .onError((e: ErrorContext)=>{
    //     //     console.error("DB subscription error", e.event ?? e)
    //     //     sub.unsubscribe()
    //     //     rj(e.event ?? new Error("Unknown DB subscription error"))
    //     //   })
    //     //   .subscribe(`select * from storage where owner_key = '${owner_key}'`)
    //     // })

    //     let cache:T = await _get(owner, key)
    //       .then(val=>{
    //         try{
    //           validate(pattern, val)
    //         }catch(e){
    //           val = fill(pattern) as T
    //         }
    //         return val as T
    //       })

    //     let cacheS = JSON.stringify(cache)

    //     const listeners: (()=>void)[] = []
    //     const set = async (data:T) =>{
    //       let newS = JSON.stringify(data)
    //       if (cacheS== newS){return}
    //       validate(pattern, data)
    //       cache = data as T
    //       cacheS = newS
    //       listeners.forEach(l=>l())
    //       db.saving++;
    //       await c.procedures.setitem({owner, passhash: pwd(), key, value: JSON.stringify(data)})
    //       .then((r)=>{
    //         db.saving--;
    //         if (r.tag != "Success"){throw new Error("Failed to set item in DB: " + JSON.stringify(r))}
    //       })
    //     }

    //     let stored : Stored<T> =  {
    //       key, pattern, get: ()=>cache, set,
    //       update: async x=> {
    //         let p = await x(cache)
    //         if (p!=undefined) set(p)
    //       },onupdate: f=>{
    //         console.log("added listener", owner_key)
    //         listeners.push(f)}
    //     }
    //     hot_cache.set(owner_key, stored as any as Stored<JsonData>)
    //   }
    //   return hot_cache.get(owner_key) as any as Stored<T>
    // };

    function mkStored<T extends JsonData>(key:string, pattern:Pattern, value:T, owner?:string): Stored<T>{
      try{
        validate(pattern, value)
      }catch(e){
        value = fill(pattern) as T
      }

      let cacheS = JSON.stringify(value)

      const listeners: (()=>void)[] = []
      const set = async (data:T) =>{
        let newS = JSON.stringify(data)
        if (cacheS== newS){return}
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
      
      return  {
        key, pattern, get: ()=>value, set,
        update: async x=> {
          let p = await x(value)
          if (p!=undefined) set(p)
        },onupdate: f=>{
          console.log("added listener", owner ?? db.userid, key)
          listeners.push(f)}
      }
    }


    const get = async <T extends JsonData> (key:string, pattern:Pattern, args: {owner?:string, upsertValue?: T, defaultValue?:T} = {}) => {
      let owner = args.owner || db.userid
      let owner_key = mkkey(owner, key)
      if (hot_cache.has(owner_key)){
        return hot_cache.get(owner_key) as any as Stored<T>
      }else{
        let val : JsonData = args.upsertValue != undefined ? args.upsertValue : await _get(owner, key).then(v=> v ?? args.defaultValue ?? null)
        let stored = mkStored(key, pattern, val as T, owner)
        hot_cache.set(owner_key, stored as any as Stored<JsonData>)
        return stored
      }
    }

    const upsert =  <T extends JsonData>(key:string, pattern:Pattern, data:T, owner?:string): Stored<T> => {
      owner ||= db.userid
      let owner_key = mkkey(owner, key)
      if (hot_cache.has(owner_key)){
        let stored = hot_cache.get(owner_key) as any as Stored<T>
        stored.set(data)
        return stored
      }else{
        let stored = mkStored(key, pattern, data, owner)
        hot_cache.set(owner_key, stored as any as Stored<JsonData>)
        return stored
      }
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
