
// this script functions 
// for creating json_content folder

import { exit } from "node:process";
import { createModule, db, ModPathPattern } from "../controller/module";
import { stringify } from "../model/json";
import { toSchema, fromSchema, type Pattern, validate } from "../model/pattern";

import { readFile, writeFile } from "node:fs/promises"


type ModuleParams = {
  id: string,
  name: string,
  sort_order: number,
  module_type: string,
  location: string
}

type TaxonomyParams = {
  taxonomy: {
    categories: {
      id: string,
      name: string,
      sort_order: number,
      description: string,
      subcategories:{
        id: string,
        name: string,
        sort_order: number,
        description: string
      }[]
    }[]
  }
}

type ItemParams = {
  id: string,
  name: string,
  depiction: string,
  taxonomy: {
    category: string,
    subcategory: string
  }
}

const ModulePattern: Pattern = {
  id: String,
  name: String,
  sort_order: Number,
  module_type: String,
  location: String
}

const ModuleListPattern: Pattern = {
  modules: [ModulePattern]
}

const [path] = process.argv.slice(2)

if (!path || !path.endsWith("json_content")) {
  console.error("Usage: node scripts/pull_module.js <path_to_json_content_folder>")
  exit()
}

console.info("Pulling module from path", path)
console.info("pwd:", process.cwd())

let module_list = await readFile( path + "/modules.json").then(d=>JSON.parse(d.toString()) ) as { modules: ModuleParams[] }
validate(ModuleListPattern, module_list)

console.log(module_list)


let update = ()=>{
  db.get_published().then(mods=>mods.forEach(async mod=>{
    let modid = mod.owner + "/" + mod.module + "/" + mod.version
    if (module_list.modules.some(l=> l.id == modid)) return
    let mod_data = await createModule({owner: mod.owner, name: mod.module}, ()=>{})
    let tax = mod_data.taxonomy.get()
    let taxonomyParams : TaxonomyParams = {
      taxonomy: {
        categories: Object.entries(tax.categories).map(([catName, cat])=>({
          id: catName,
          name: catName,
          sort_order: 0,
          description: cat.description,
          subcategories: Object.entries(cat.subCategories).map(([subcatName, subcat])=>({
            id: subcatName,
            name: subcatName,
            sort_order: 0,
            description: subcat.description,
          }))
        }))
      }
    };

    let proms : Promise<void>[] = []

    proms.push(writeFile(`${path}/${modid}/en/taxonomy.json`, stringify(taxonomyParams)))

    Object.entries(mod_data.extraction.get()).forEach(([catName, cat])=>{
      Object.entries(cat).forEach(([subcatName, subcat])=>{
        Object.entries(subcat).forEach(([itemName, item])=>{

          let itemParams:ItemParams= {
            id: `${modid}_${catName}_${subcatName}_${itemName}`,
            name: itemName,
            depiction: item.depiction,
            taxonomy: {
              category: catName,
              subcategory: subcatName
            }
          }
          proms.push(writeFile(`${path}/${modid}/en/data/${catName}/${subcatName}/${itemName}.json`, stringify(itemParams)))
        })
      })
    })

    await Promise.all(proms)

    let moduleParams: ModuleParams = {
      id: modid,
      name: mod.module,
      sort_order: 0,
      module_type: "extraction",
      location: modid
    }

    module_list.modules.push(moduleParams)
    await writeFile( path + "/modules.json", stringify(module_list))


  }))
}

