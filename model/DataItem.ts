import { db } from "../controller/module";
import type { Store } from "./db";
import { type Pattern, ANY, fromSchema, toSchema, validate } from "./pattern";
import type { JsonData, JSONSchema } from "./types";

type DataItemID = [string, ...string[]]

type DataItem = {
  id: DataItemID,
  content: JsonData,
  ChildSchema?: JSONSchema,
  children: string[],
}

const DataItemPattern = {
  id: [String],
  content: ANY,
  "ChildSchema?": ANY,
  children: [String],
}

export const mkKey = (id: DataItemID) => "data:"+id.join("/")
const itemCache = new Map<string, Store<DataItem>>()


export const setItem = async (name: string, content: JsonData, parent?: DataItemID, ChildSchema?: JSONSchema) : Promise<Store<DataItem>> => {
  let id: DataItemID = [...parent??[], name]
  if (parent){
    let parentSt = await getItem(mkKey(parent))
    parentSt.update(d=>{
      if (!d.children.includes(name)) d.children.push(name)
      return d
    })
  }
  
  return await loadItem(id, {
    id,
    content,
    ChildSchema: ChildSchema ? toSchema(ChildSchema) : undefined,
    children: [],
  })
  
}

export const loadItem = async (id: DataItemID, upsertValue ?: DataItem) : Promise<Store<DataItem>> => {
  if (!itemCache.has(mkKey(id))) {
    let myPattern : Pattern | undefined = undefined
    let currentParent = id.slice(0, -1) as DataItemID
    while(currentParent.length){
      let item = await getItem(mkKey(currentParent))
      let parentSchema = item.get().ChildSchema
      if (parentSchema) {
        myPattern = fromSchema(parentSchema)
        break
      }
      currentParent = currentParent.slice(0, -1) as DataItemID
    }
    let st = await getItem(mkKey(id), upsertValue)
    if (myPattern) st.onupdate(d=> validate(myPattern!, d.content))
  }
  return itemCache.get(mkKey(id))!
}


export const deleteItem = async(id: DataItemID) => {
  let parent = id.slice(0, -1) as DataItemID
  if (parent.length){
    let parentSt = await getItem(mkKey(parent))
    parentSt.update(d=>{
      d.children = d.children.filter(c=> c!=id[id.length-1])
      return d
    })
  }
  getItem(mkKey(id)).then(st=>{
    st.set({
      id,
      content: null,
      children: []
    })
    itemCache.delete(mkKey(id))
  })
}


const getItem = async (key:string, upsertValue?: DataItem) : Promise<Store<DataItem>> => {
  let st = await db.get<DataItem>(key, DataItemPattern, {upsertValue})
  itemCache.set(key, st)
  return st
}
