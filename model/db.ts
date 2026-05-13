import {  type JsonData } from "./types"
import { DbConnection, type ErrorContext, type SubscriptionEventContext } from "./module_bindings"
import { ANY, fill, validate, type Pattern } from "./pattern"
import { hash } from "./hash"



export const storage = typeof window !== "undefined" ?
  localStorage:
  (()=>{
    const db = new Map<string, string>()
    return {
      setItem:(key: string, value: string)=> {db.set(key, value)},
      getItem:(key: string): string | null => db.get(key) ?? null,
      clear:()=> {db.clear()}
    }
  })()

export type Store <T extends JsonData> = {
  pattern: Pattern
  get: ()=> T
  set: (data:T)=>void,
  onupdate: (listener:(t:T)=>void, deferred? : true)=>void
  update: (updater: (data:T)=>T | void) => void
  map: <U extends JsonData>(fn: (v:T)=>U, pat?:Pattern) => Store<U>
}


const mkStore = <T extends JsonData> (request: ()=>T, persist: (t:T)=>void, pattern: Pattern): Store <T> => {
  let listeners : ((data:T)=>T | Promise<T> | void)[] = []
  let val = request()
  try{
    validate(pattern, val)
  }catch(e){
    val = fill(pattern) as T
  }
  let str = JSON.stringify(val)
  let set = (v:T)=>{
    let ns = JSON.stringify(v)
    if (ns == str) return
    validate(pattern, v)
    val = v
    str = ns
    listeners.forEach(f=>f(v))
    persist(v)
  }
  let onupdate = (ls:(t:T)=>void, dd?:true)=>{
    if (!dd) ls(val)  
    listeners.push(ls)
  }
  return {
    pattern,
    get: ()=>val,
    set, onupdate,
    update: (f:(t:T)=>T | void)=>{
      let r = f(val)
      if (r!=undefined) set(r)
    },
    map: <U extends JsonData>(fn: (v:T)=>U, pat: Pattern = ANY) => {
      let mapped = mkStore<U>(()=>fn(val), v=>{}, pat)
      listeners.push(v=> mapped.set(fn(v)))
      return mapped
    }
  } 
}

export const LocalStored = <T extends JsonData> (key: string, pattern: Pattern, defaultValue?: T) =>
  mkStore<T>(()=>JSON.parse(storage.getItem(key)!) ?? defaultValue  ?? fill(pattern) as T, v=> storage.setItem(key, JSON.stringify(v)), pattern)

export const noStore = <T extends JsonData>(pattern: Pattern, defaultValue?: T) => mkStore<T>(()=> defaultValue ?? fill(pattern) as T, v=>{}, pattern)


export type DB = {
  signup(arg: {userid:string, passhash:string}):Promise<void>
  userid: string,
  changePassword(newPassword:string):Promise<void>
  disconnect(): void
  get<T extends JsonData>(key:string, pattern:Pattern, args?:
    {
      owner?:string,
      defaultValue?:T,
      upsertValue?: T
    },
  ): Promise<Store<T>>
  saving: Store<number>,
  publish: (key:string, del:boolean) => Promise<void>
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
    console.info("DB connected.")
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
          sub.unsubscribe()
          rj(e.event ?? new Error("Unknown DB subscription error"))
        })
        .subscribe(`select * from storage where owner_key = '${mkkey(owner, key)}'`)
      })
    }

    const hot_cache = new Map<string, Store<JsonData>>()
    const get = async <T extends JsonData> (key:string, pattern:Pattern, args: {owner?:string, upsertValue?: T, defaultValue?:T} = {}) => {
      let owner = args.owner || db.userid

      console.log("getting item:", owner, key)

      let owner_key = mkkey(owner, key)
      if (!hot_cache.has(owner_key)){
        let value = args.upsertValue != undefined ? null : await _get(owner, key).then(v=> v ?? args.defaultValue ?? null) 
        hot_cache.set(owner_key, mkStore(
          ()=>value,
          async (v)=>{
            db.saving.update(x=>x+1)
            console.log("saving: ", db.saving.get(), owner, pwd())
            c.procedures.setitem({owner, passhash: pwd(), key, value: JSON.stringify(v)})
            .then((r)=>{
              db.saving.update(x=>x-1)
              if (r.tag != "Success"){throw new Error("Failed to set item in DB: " + JSON.stringify(r))}
            })
            .catch(e=>{
              db.saving.update(x=>x-1)
              console.error("Failed to set item in DB", e)
            })
          },
          pattern))
      }
      let res = hot_cache.get(owner_key)! as any as Store<T>
      if (args.upsertValue != undefined) res.set(args.upsertValue)
      return res
    }

    let db:DB = {
      userid: localUser.get().userid,
      saving:noStore(Number),
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
      get,
      publish : (key:string, del:boolean)=> c.procedures.publish({owner: db.userid, passhash: pwd(), key, del})
        .then(r=>{
          if (r.tag == "Err") throw new Error("Failed to publish")
          else console.log("Published: ", key, del)
        })

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
