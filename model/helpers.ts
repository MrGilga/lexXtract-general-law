
// import { Role, type ExtractionItem, type Schema } from "./schemas"
// import { hash } from "./db"

import type { Stored } from "./db"
import { fill, validate, type Pattern } from "./pattern"
import type { JsonData } from "./types"

let browser = typeof window !== "undefined"


export const storage = browser ?
  localStorage:
  (()=>{
    const db = new Map<string, string>()
    return {
      setItem:(key: string, value: string)=> {db.set(key, value)},
      getItem:(key: string): string | null => db.get(key) ?? null,
      clear:()=> {db.clear()}
    }
  })()

const cache_func = <T extends Function>  (f:T ):T =>{
  let fnhash = f.toString()
  return (((...args:any[])=>{
    let key = JSON.stringify([fnhash, args])
    let res = storage.getItem(key)
    if (res) {
      let p = JSON.parse(res) as {async:boolean, value:any}
      if (p.async) return Promise.resolve(p.value)
      else return p.value
    }
    
    let dat = f(...args)
    if (dat instanceof Promise){
      return dat.then(value=>{
        storage.setItem(key, JSON.stringify({async:true, value}))
        return value
      })
    }
    storage.setItem(key, JSON.stringify({async:false, value:dat}))
    return dat
  }) as unknown as T)
}


export const LocalStored = <T extends JsonData>(key:string, pattern:Pattern, default_value?:T):Stored<T> =>{
  default_value ||= fill(pattern) as T
  validate(pattern, default_value as any)
  let listeners= new Set<()=>void>()
  const set = (val:T)=> {
    validate(pattern, val as any)
    let d = JSON.stringify(val)
    if (storage.getItem(key) == d) return
    storage.setItem(key, d)
    listeners.forEach(f=>f())
  }

  const onupdate = (callback:()=>void)=> listeners.add(callback)

  const get =()=>{
      let val = storage.getItem(key)
      if (val == null || val == "null") return default_value
      let d = JSON.parse(val) as T
      try{
        validate(pattern, d)
      }catch(e){
        return default_value
      }
      return d
    }

  return {
    get,
    pattern,
    key,
    set,
    onupdate,
    update: async (f:(x:T)=>T|void| Promise<T>)=>{
      let r = f(get())
      if (r instanceof Promise) r.then(set)
      else if (r) set(r)
    }
  }
}
