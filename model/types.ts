// import type { FunctionDef } from "../web/agent_functions"
import type { Store } from "./db"
import type { Pattern } from "./pattern"

export type Prompt = string

export type Document = {
  type: "txt",
  content:string
} | {
  type: "pdf",
  content: ArrayBuffer
}

export type ModPath = {
  owner: string,
  name: string
}
export type Capability = "documents" | "extraction" | "functions" | "taxonomy" | "prompt" | "agents"

export type FunctionParams = {
  parameters: Record<string, JSONSchema>,
  description?: string,
  reads?: Capability[],
  writes?: Capability[],
}

export type ExtractionItem = {
  depiction: string,
  links: {
    title: string,
    category: string,
    subcategory: string,
    item: string,
  }[],
  sources: {
    documentId: string,
    excerpt: string,
  }[]
}


export type Extraction = { [category: string]: { [subcategory: string]: { [itemTitle: string]: ExtractionItem } } }

export type Module = {
  path: ModPath,
  db: <T extends JsonData>(key:string, pattern:Pattern, args?: {upsertValue?:T, defaultValue?:T})=>Promise<Store<T>>,
  taxonomy: Store<Taxonomy>
  documents: Store<{[key:string]: string}>,
    extraction: Store<Extraction>,
  functions: Store<{[key:string]: FunctionParams}>,
  prompt: Store<string>,
  agents: Store<string[]>
}

export type App = {
  [name:string]: Module
}

export type ETKOM = {
  modules: {
    name:string,
    extraction: JsonData
  }[]
}

export type JsonData = string | null | number | boolean | { [key: string]: JsonData } | JsonData[]

export type JSONSchema = { [key: string]: JsonData }

export type Taxonomy = {
  categories: {
    [name: string]: {
      description: string,
      subCategories: {
        [name: string]: {
          description: string,
          itemSchema: JSONSchema
        }
      }
    }
  }
}
export type Path = (string | number)[]


export type Message = {role: "user" | "assistant" | "system", content: string}
| {type: "function_call", id: string, call_id: string, name:string, arguments: string}
| {type: "function_call_output", call_id: string, output: string}


export type Agent = {
  id: string,
  tools: string[],
  msgs_ctr: number
}


