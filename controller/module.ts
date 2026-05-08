import { default_functions } from "./functions";
import { RemoteDB, type Stored } from "../model/db";
import { SchemaPattern, TaxonomyPattern, type Pattern } from "../model/pattern";
import type { JsonData, Taxonomy } from "../model/types";
import { type ModPath , type FunctionDef, type Module } from "../model/types";

const CapabilityPattern: Pattern = ["taxonomy", "documents", "prompt", "functions", "extraction", "agents"]

export const FunctionDefPattern: Pattern = {
  "description?": String,
  "reads?": [CapabilityPattern],
  "writes?": [CapabilityPattern],
  parameters: {"[key:string]": SchemaPattern},
  code: String
}

export const db = await RemoteDB()
export const ModPathPattern:Pattern = {
  owner: String,
  name: String,
}


export const createModule = async (path: ModPath, tryCopy : (callback:()=>Promise<ModPath>)=>void ): Promise<Module> => {
  let module_list = await db.get<ModPath[]>("modules", [ModPathPattern])
  if (!module_list.get().map(x=>JSON.stringify(x)).includes(JSON.stringify(path))) module_list.set([...module_list.get(), path])
  let modState: Stored<any>[] = []
  let mod_db = async  <T extends JsonData> (key:string, pattern:Pattern, args: {upsertValue?:T, defaultValue?:T} = {}) => {
    console.log("MODDB request", {key, pattern, args})
    let st = await db.get<T>(path.name+":"+key, pattern, {owner: path.owner, ...args})
    if (path.owner != db.userid) st.set = async ()=>{
      tryCopy(()=> createModule({owner: db.userid, name: path.name}, tryCopy)
        .then(newmod=>Promise.all([
          newmod.documents.set(module.documents.get()),
          newmod.extraction.set(module.extraction.get()),
          newmod.functions.set(module.functions.get()),
          newmod.taxonomy.set(module.taxonomy.get()),
          newmod.prompt.set(module.prompt.get())
        ]).then(()=>newmod.path))
      )
    }
    modState.push(st as any as Stored<JsonData>)
    return st
  }

  const [taxonomy, extraction, documents, functions, prompt, agents] = await Promise.all([
    mod_db<Taxonomy>("taxonomy", TaxonomyPattern),
    mod_db<JsonData>("extraction", {"[key:string]": {"[key:string]": {"[key:string]": {depiction: String, content: String}}}}),
    mod_db<{[key:string]: string}>("documents", {"[key:string]": String}),
    mod_db<{[key:string]: FunctionDef}>("functions", {"[key:string]": FunctionDefPattern}),
    mod_db<string>("prompt", String, {defaultValue: "You are an expert text analysis assistant."}),
    mod_db<string[]>("agents", [String])
  ])

  const module: Module ={db: mod_db,functions,taxonomy,extraction,documents,prompt,path, agents}
  if (path.owner == db.userid) await module.functions.set(default_functions)
  return module
}



