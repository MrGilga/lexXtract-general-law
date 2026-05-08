
import type { Agent, FunctionDef, Module } from "../model/types";
import { SchemaPattern, toSchema, validateSchema, type Pattern } from "../model/pattern";
import { startAgent, type AgentTemplate } from "./agent";


export const ProjectMission = `Lexxtract General Law Project
the goal is to bring complex Law text into a structured and well formed format.
Each Module is consists of a taxonomy, a set of documents, and a set of extractions.

The taxonomy is a hierarchical categorization of legal concepts, with categories and subcategories. For example, a category could be "Contracts", with subcategories "Formation", "Breach", "Remedies", etc.

The documents are the legal texts that we want to analyze and extract information from. This is the grond truth that we want to structure.

The Extractions are the structured representations of the information we have extracted from the documents, organized according to the taxonomy. Each Item belongs to a subcategory and each subcategory belongs to a category. Items can have a title, a depiction (a short text describing the item), source references, pointing to the document they were extracted from, and possibly links to other items

`


const specialistAgents : AgentTemplate[] = [
  {
    name: "TaxonomyArchitect",
    prompt: ProjectMission+ "You are a taxonomy architect. Your task is to design and maintain the taxonomy for the project. The taxonomy is a hierarchical categorization of legal concepts, with categories and subcategories.",
    tools: ["viewTaxonomy", "addCategory", "removeCategory", "addSubcategory", "removeSubCategory", "listDocuments", "viewDocument"]
  },
  {
    name: "ExtractionExpert",
    prompt: ProjectMission+"You are an extraction expert. Your task is to extract information from the documents and organize it according to the taxonomy. Each piece of information you extract should be categorized under a subcategory in the taxonomy, and should include at least a title, a depiction (a short text describing the item), and source references pointing to the document it was extracted from.",
    tools: ["viewTaxonomy", "listDocuments", "viewDocument", "addExtraction", "viewExtractions"]
  }
]

export const launchFunctions : {[key:string]: FunctionDef} = Object.fromEntries(specialistAgents.map(agent=>[agent.name, {
  description: `launch a ${agent.name} agent`,
  parameters: {assignment: toSchema(String)},
  reads: ['agents'],
  writes: ['agents'],
  code: `
try{
  return agents.start(${JSON.stringify(agent.prompt)} + assignment, ${JSON.stringify(agent.tools)})
}catch(e){
  return "ERROR launching agent: " + e.message
}
`
}]))



export const agentCoordinator : AgentTemplate = {
  name: "Coordinator",
  prompt:  ProjectMission+"You are a coordinator agent. Your task is to delegate requests from the user to a team of subagents, and to summarize their responses. Your main tools are launching agents and messaging agents. Each agent is responsible for picking their own tools for each job. Each one also has a ProjectMission overview. When they are finished the should report back to you with a summary. If you want to ask an agent or have additional instrucitons you can message them directly after they reported back.",
  tools: [...Object.keys (launchFunctions), "messageAgent"]
}


export const default_functions: {[key:string]: FunctionDef} = {
  viewTaxonomy: {
    description: "a function that returns the taxonomy",
    parameters: {},
    reads: ["taxonomy"],
    code: `return taxonomy.get()`
  },
  addCategory: {
    description: "add a category to the taxonomy",
    parameters: {
      categoryName: {type: "string"},
    },
    reads: ["taxonomy"],
    writes: ["taxonomy"],
    code: `
      taxonomy.update((t)=>{
        categoryName ||= "newCat"
        if (t.categories[categoryName]) return t
        t.categories[categoryName] = {description: "a category", subCategories:{}}
        return t
      })
      `
  },
  removeCategory: {
    description: "remove any Category from the taxonomy",
    parameters: {
      catName: {
        type: "string"
      }
    },
    reads: [
      "taxonomy"
    ],
    writes: [
      "taxonomy"
    ],
    code: "taxonomy.update(t=>{delete t.categories[catName];console.log(t);return t})",
  },
  addSubcategory: {
    description: "a function that adds a subcategory to the taxonomy",
    parameters: {
      categoryName: {type: "string"},
      subcategoryName: {type: "string"},
    },
    reads: ["taxonomy"],
    writes: ["taxonomy"],
    code: `
      taxonomy.update((t)=>{
        if (!t.categories[categoryName]) throw new Error("invalid category")
        subcategoryName ||= "newSubcat"
        if (t.categories[categoryName].subCategories[subcategoryName]) return t
        t.categories[categoryName].subCategories[subcategoryName] = {description: "a subcategory"}
        return t
      })
      `
  },
  removeSubCategory: {
    description: "remove any SubCategory from the taxonomy",
    parameters: {
      catName: {
        type: "string"
      },
      subCatName: {
        type: "string"
      }
    },
    reads: [
      "taxonomy"
    ],
    writes: [
      "taxonomy"
    ],
    code: "taxonomy.update(t=>{delete t.categories[catName].subCategories[subCatName];console.log(t);return t})",
  },
  addExtraction: {
    description: "a function that adds an extraction to the extraction db",
    parameters: {
      categoryName: {type: "string"},
      subcategoryName: {type: "string"},
      title: {type: "string"},
      depiction: {type: "string"},
      sources: toSchema([{
        documentId: {type: "string"},
        excerpt: {type: "string"}
      }])
    },
    reads: ["taxonomy", "extraction"],
    writes: ["extraction"],
    code: `
      extraction.update(e=>{
        if (!e[categoryName]) e[categoryName] = {}
        if (!e[categoryName][subcategoryName]) e[categoryName][subcategoryName] = {}
        e[categoryName][subcategoryName][title] = {depiction, sources, links: []}
        return e
      })
    `
  },
  listDocuments:{
    description: "list document titles",
    parameters: {},
    reads: ["documents"],
    code: 'return Object.keys(documents.get())'
  },
  viewDocument:{
    description: "view a document by title",
    parameters: {title: {type: "string"}},
    reads: ["documents"],
    code: 'return documents.get()[title]'
  },
  viewExtractions: {
    description: "a function that views extractions for a given category and subcategory",
    parameters: {
      categoryName: toSchema(["ALL", String]),
      subcategoryName: toSchema(["ALL", String])
    },
    reads: ["extraction"],
    code: `
      // return extraction.get().then(e=>{
      //   if (categoryName == "ALL") return e
      //   if (!e[categoryName]) throw new Error("invalid category")
      //   if (subcategoryName == "ALL") return e[categoryName]
      //   return e[categoryName][subcategoryName]
      // })
      let e = extraction.get()
      if (categoryName == "ALL") return e
      if (!e[categoryName]) throw new Error("invalid category")
      if (subcategoryName == "ALL") return e[categoryName]
      return e[categoryName][subcategoryName]
      `
  },
  // startAgent: {
  //   description: "start a subagent with a given prompt and tools. tools should be names of functions defined here. This will return the ID of the new agent.",
  //   parameters: {
  //     prompt: toSchema(String),
  //     tools: toSchema([String]),
  //   },
  //   reads: ['agents'],
  //   writes: ['agents'],
  //   code:`
  //     return agents.start(prompt, tools)
  //   `
  // },

  ...launchFunctions,

  messageAgent: {
    description: "send a message to an agent. This will trigger the agent to run, and return its response.",
    parameters: {
      agent_id: toSchema(String),
      msg: toSchema(String)
    },
    reads: ['agents'],
    writes: ['agents'],
    code:`
      return agents.message(agent_id, msg)
    `
  }
}




