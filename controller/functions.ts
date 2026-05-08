
import type { FunctionDef, Module } from "../model/types";
import { SchemaPattern, toSchema, validateSchema, type Pattern } from "../model/pattern";


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
      content: {type: "string"},
    },
    reads: ["taxonomy", "extraction"],
    writes: ["extraction"],
    code: `
      extraction.update(e=>{
        if (!e[categoryName]) e[categoryName] = {}
        if (!e[categoryName][subcategoryName]) e[categoryName][subcategoryName] = {}
        e[categoryName][subcategoryName][title] = {depiction, content}
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
      return extraction.get().then(e=>{
        if (categoryName == "ALL") return e
        if (!e[categoryName]) throw new Error("invalid category")
        if (subcategoryName == "ALL") return e[categoryName]
        return e[categoryName][subcategoryName]
      })
      `
  },
  startAgent: {
    description: "start a subagent with a given prompt and tools. tools should be names of functions defined here. This will return the ID of the new agent.",
    parameters: {
      prompt: toSchema(String),
      tools: toSchema([String]),
    },
    reads: ['agents'],
    writes: ['agents'],
    code:`
      return agents.start(prompt, tools)
    `
  },

  startTaxonomyAgent: {
    description: "start a subagent with a given prompt and tools. tools should be names of functions defined here. This will return the ID of the new agent.",
    parameters: {},
    reads: ['agents'],
    writes: ['agents'],
    code:`
      return agents.start("you are a taxonomy analyzer. first summarize the current Taxonomy.", ["viewTaxonomy"])
    `
  },


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
