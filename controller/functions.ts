
import type { Extraction, FunctionParams, JsonData, Module, Taxonomy } from "../model/types";
import { toSchema } from "../model/pattern";
import { msgAgent, runagent, runningAgents, startAgent, type AgentTemplate } from "./agent";
import type { Store } from "../model/db";
import { stringify } from "../model/json";


export const ProjectMission = `Lexxtract General Law Project
the goal is to bring complex Law text into a structured and well formed format.
Each Module is consists of a taxonomy, a set of documents, and a set of extractions.

The taxonomy is a hierarchical categorization of legal concepts, with categories and subcategories. For example, a category could be "Contracts", with subcategories "Formation", "Breach", "Remedies", etc.

The documents are the legal texts that we want to analyze and extract information from. This is the grond truth that we want to structure.

The Extractions are the structured representations of the information we have extracted from the documents, organized according to the taxonomy. Each Item belongs to a subcategory and each subcategory belongs to a category. Items can have a title, a depiction (a short text describing the item), source references, pointing to the document they were extracted from, and possibly links to other items

`


export type Tool = {
  def: FunctionParams,
  runner: (
    taxonomy: Store<Taxonomy>,
    documents: Store<{[key:string]: string}>,
    extraction: Store<Extraction>,
    agents: {
      start: (prompt: string, tools: string[])=>Promise<string>,
      message: (agent_id: string, msg: string)=>Promise<string>
    },
    args: JsonData,
  )=> JsonData | Promise<JsonData>
}


export const runTool = (mod:Module, name:string, args: JsonData):Promise<JsonData>=>{
  let tool = Tools[name]
  if (!tool) throw new Error("not found:"+name)
  try{
    return Promise.resolve(tool.runner(mod.taxonomy, mod.documents, mod.extraction, {
      start: (prompt, tools) => startAgent(mod, prompt, tools).then(id => {
          console.log("Started agent", id, "with prompt", prompt, "and tools", tools)
          return runagent(mod, id).then(resp=>{
            let txt = "role" in resp ? resp.content : JSON.stringify(resp)
            console.log("Agent", id, "finished with response", txt)
            return stringify( {
              agent_id: id,
              response: txt
            })
          })
        }),
      message: (id, msg)=>
        msgAgent(mod, id, msg)
        .then(async ()=>{
          const resp = await runagent(mod, id);
          let txt = "role" in resp ? resp.content : JSON.stringify(resp);
          console.log("Agent", id, "finished with response", txt);
          return stringify({agent_id: id, response: txt });
        }),
    }, args))
  }catch(e){
    return Promise.resolve({error: e instanceof Error ? e.message : String(e)} as JsonData)
  }
}


const TaxonomyExpert : AgentTemplate = {
  name: "TaxonomyExpert",
  description: "Start a new Taxonomy Expert agent to design and maintain and explain the taxonomy for the project.",
  prompt: ProjectMission+ "You are a taxonomy architect. Your task is to design and maintain the taxonomy for the project. The taxonomy is a hierarchical categorization of legal concepts, with categories and subcategories.",
  tools: ["viewTaxonomy", "addCategory", "removeCategory", "addSubcategory", "removeSubCategory", "listDocuments", "viewDocument"]
}

const ExtractionExpert : AgentTemplate = {
  name: "ExtractionExpert",
  description: "Start a new Extraction Expert agent to extract information from the documents and organize it according to the taxonomy.",
  prompt: ProjectMission+"You are an extraction expert. Your task is to extract information from the documents and organize it according to the taxonomy. Each piece of information you extract should be categorized under a subcategory in the taxonomy, and should include at least a title, a depiction (a short text describing the item), and source references pointing to the document it was extracted from.",
  tools: ["viewTaxonomy", "listDocuments", "viewDocument", "addExtraction", "viewExtractions", "removeExtraction"]
}

const mkstarter = (template: AgentTemplate): Tool => ({
  def:{
    description: template.description ? template.description : `Start a new ${template.name} agent with a custom prompt` ,
    parameters: {
      prompt: {type: "string"},
    },
    reads: [],
    writes: ["agents"]
  },
  runner: (taxonomy, documents, extraction, agents, args) => {
    return agents.start( template.prompt +  (args as {prompt: string}).prompt, template.tools)
  }
})

export const coordinatorAgent : AgentTemplate = {
  name: "Coordinator",
  prompt: ProjectMission+"You are a coordinator agent. Your task is to delegate requests from the user to a team of subagents, and to summarize their responses. Your main tools are launching agents and messaging agents. Each agent is responsible for picking their own tools for each job. Each one also has a ProjectMission overview. When they are finished the should report back to you with a summary. If you want to ask an agent or have additional instrucitons you can message them directly after they reported back.",
  tools: [ "startTaxonomyExpert", "startExtractionExpert", "messageAgent"]
}

export const Tools : {[key:string]: Tool} = {

  viewTaxonomy: {
    def: {
      description: "a function that returns the taxonomy",
      parameters: {},
      reads: ["taxonomy"],
    },
    runner: (taxonomy)=> taxonomy.get()
  },
  listDocuments:{
    def: {
      description: "list document titles",
      parameters: {},
      reads: ["documents"],
    },
    runner: (_1, documents) => Object.keys(documents.get())
  },
  viewDocument:{
    def: {
      description: "view a document by title",
      parameters: {title: {type: "string"}},
      reads: ["documents"],
    },
    runner: (_1, documents, _2, _3, args) => (documents.get())[(args as {title: string}).title]!
  },
  viewExtractions: {
    def: {
      description: "a function that views extractions for a given category and subcategory",
      parameters: {
        categoryName: toSchema(["ALL", String]),
        subcategoryName: toSchema(["ALL", String])
      },
      reads: ["extraction"],
    },
    runner: (_1, _2, extraction, _3, args) => {
      let {categoryName, subcategoryName} = args as {categoryName: string, subcategoryName: string}
      let e = extraction.get()
      if (categoryName == "ALL") return e
      if (!e[categoryName]) throw new Error("invalid category")
      if (subcategoryName == "ALL") return e[categoryName]
      return e[categoryName][subcategoryName]!
    }
  },
  addCategory: {
    def: {
      description: "a function that adds a category to the taxonomy",
      parameters: {categoryName: {type: "string"}, description: {type: "string"}},
      reads: ["taxonomy"],
      writes: ["taxonomy"],
    },
    runner: (taxonomy:Store<Taxonomy>, _2, _3, _4, args) => {
      let {categoryName, description} = args as {categoryName: string, description: string}
      taxonomy.update(t=>{
        if (!t.categories[categoryName]) t.categories[categoryName] = {description, subCategories: {}}
        return t
      })
      return "OK"
    }
  },
  removeCategory: {
    def: {
      description: "a function that removes a category from the taxonomy",
      parameters: {categoryName: {type: "string"}},
      reads: ["taxonomy"],
      writes: ["taxonomy"],
    },
    runner: (taxonomy, _2, _3, _4, args) => {
      let {categoryName} = args as {categoryName: string}
      taxonomy.update(t=>{
        delete t.categories[categoryName]
        return t
      })
      return "OK"
    }
  },
  addSubcategory: {
    def: {
      description: "a function that adds a subcategory to a category in the taxonomy",
      parameters: {
        categoryName: {type: "string"},
        subcategoryName: {type: "string"},
      },
      reads: ["taxonomy"],
      writes: ["taxonomy"],
    },
    runner: (taxonomy:Store<Taxonomy>, _2, _3, _4, args) => {
      let {categoryName, subcategoryName} = args as {categoryName: string, subcategoryName: string}
      taxonomy.update(t=>{
      
        if (!t.categories[categoryName]) t.categories[categoryName] = {description: "", subCategories: {}}

        return t
      })
      return "OK"
    }
  },
  removeSubCategory: {
    def: {
      description: "a function that removes a subcategory from a category in the taxonomy",
      parameters: {
        categoryName: {type: "string"},
        subcategoryName: {type: "string"},
      },
      reads: ["taxonomy"],
      writes: ["taxonomy"],
    },
    runner: (taxonomy:Store<Taxonomy>, _2, _3, _4, args) => {
      let {categoryName, subcategoryName} = args as {categoryName: string, subcategoryName: string}
      taxonomy.update(t=>{
        if (t.categories[categoryName]) delete t.categories[categoryName].subCategories[subcategoryName]
        return t
      })
      return "OK"
    }
  },
  addExtraction: {
    def: {
      description: "a function that adds an extraction item",
      parameters: {
        categoryName: {type: "string"},
        subcategoryName: {type: "string"},
        title: {type: "string"},
        depiction: {type: "string"},
        sources: toSchema([{documentId: String, excerpt: String}]),
      },
      reads: ["extraction"],
      writes: ["extraction"],
    },
    runner: (_1, _2, extraction, _3, args) => {
      let {categoryName, subcategoryName, title, depiction, sources} = args as {categoryName: string, subcategoryName: string, title: string, depiction: string, sources: {documentId: string, excerpt: string}[]}
      extraction.update(e=>{
        if (!e[categoryName]) e[categoryName] = {}
        if (!e[categoryName][subcategoryName]) e[categoryName][subcategoryName] = {}
        e[categoryName][subcategoryName][title] = {depiction, sources, links: []}
        return e
      })
      return "OK"
    }
  },
  removeExtraction: {
    def: {
      description: "a function that removes an extraction item",
      parameters: {
        categoryName: {type: "string"},
        subcategoryName: {type: "string"},
        title: {type: "string"},
      },
      reads: ["extraction"],
      writes: ["extraction"],
    },
    runner: (_1, _2, extraction, _3, args) => {
      let {categoryName, subcategoryName, title} = args as {categoryName: string, subcategoryName: string, title: string}
      extraction.update(e=>{
        if (e[categoryName] && e[categoryName][subcategoryName] && e[categoryName][subcategoryName][title]){
          delete e[categoryName][subcategoryName][title]
        }
        return e
      })
      return "OK"
    }
  },
  startTaxonomyExpert: mkstarter(TaxonomyExpert),
  startExtractionExpert: mkstarter(ExtractionExpert),
  messageAgent: {
    def:{
      description: "send a message to an agent",
      parameters: {
        agent_id: {type: "string"},
        message: {type: "string"}
      },
      reads: [],
      writes: []
    },
    runner: (taxonomy, documents, extraction, agents, args) => {
      let {agent_id, message} = args as {agent_id: string, message: string}
      return agents.message(agent_id, message)
    }
  }

}


export const launchFunctionTools : {[key:string]: Tool} = {}


export const functionReps: {[key:string]: FunctionParams} = Object.fromEntries(Object.entries(Tools).map(([k,t])=>[k,t.def] as [string, FunctionParams]))
