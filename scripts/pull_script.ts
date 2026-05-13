
// this script functions 
// for creating json_content folder

import { exit } from "node:process";
import { createModule, db, ModPathPattern } from "../controller/module";
import { stringify } from "../model/json";
import { toSchema, fromSchema, type Pattern, validate } from "../model/pattern";

import { readFile, writeFile } from "node:fs/promises"
import { mkdir } from "node:fs/promises";


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
  sort_order: number,
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
    let modid = mod.owner + ":" + mod.module + ":" + mod.version
    // if (module_list.modules.some(l=> l.id == modid)) return
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

    console.log(stringify(taxonomyParams))

    let proms : Promise<void>[] = []

    await mkdir(`${path}/${modid}/en`, {recursive: true})
    proms.push( writeFile(`${path}/${modid}/en/taxonomy.json`, stringify(taxonomyParams)))


    for (const [catName, cat] of Object.entries(mod_data.extraction.get())) {
      const safe = (s:string) => s.replaceAll(/[^a-z0-9]/gi, "_").toLowerCase()
      const mkId = (s:string) => safe(s)
      const itemId = (catName:string, subcatName:string, itemName:string) => `${modid}_${mkId(catName)}_${mkId(subcatName)}_${mkId(itemName)}`
      let categoryDir = `${path}/${modid}/en/data/${mkId(catName)}`
      await mkdir(categoryDir, {recursive: true})
      for (const [subcatName, subcat] of Object.entries(cat)) {
        let subcategoryDir = `${categoryDir}/${mkId(subcatName)}`
        await mkdir(subcategoryDir, {recursive: true})
        for (const [itemName, item] of Object.entries(subcat)) {
          let itemParams:ItemParams= {
            id: itemId(catName, subcatName, itemName),
            name: itemName,
            sort_order: 0,
            depiction: item.depiction,
            taxonomy: { category: catName, subcategory: subcatName }
          }
          await writeFile(`${subcategoryDir}/${mkId(itemName)}.json`, stringify(itemParams))
        }
      }
    }

    await Promise.all(proms)

    let moduleParams: ModuleParams = {
      id: modid,
      name: mod.module,
      sort_order: 0,
      module_type: "demo",
      location: modid
    }

    module_list.modules.push(moduleParams)
    await writeFile( path + "/modules.json", stringify(module_list))

  }))
}

update()