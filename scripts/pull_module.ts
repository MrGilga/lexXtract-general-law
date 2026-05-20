// this script functions
// for creating json_content folder
import { stringify } from "../model/json.js";
import { type Pattern, validate} from "../model/pattern.js";
import { readFile, writeFile } from "node:fs/promises"
import { mkdir, rm } from "node:fs/promises";

type ModuleParams = {
  id: string,
  name: string,
  sort_order: number,
  module_type: string,
  location: string
  downloaded?: true,
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
  "sort_order?": [Number, String],
  "module_type?": String,
  location: String,
  "downloaded?": true,
  $additionalProperties: true
}

const ModuleListPattern: Pattern = { 
  id: String,
  name: String,
  modules: [ModulePattern]
}
const [path] = process.argv.slice(2)


type ConfigParams = {
  sections: { name: string, sort_order: number }[],
  filters: any[],
  category_search_fields: string[],
  data_search_fields: string[],
  fields: any[],
  form_field_override: any[],
  default_field_option: {
    key: string,
    sort_order: number
    display_option: string,
    section: string
  }
}

let loop = async ()=>{
  const { createModule, db } = await import("../controller/module.js");
  let module_list = await readFile( path + "/modules.json").then(d=>JSON.parse(d.toString()) ) as { modules: ModuleParams[] }
  const safe = (s:string) => s.replaceAll(/[^a-z0-9]/gi, "_").toLowerCase()
  validate(ModuleListPattern, module_list)
  let mods = await db.get_published()

  for (const mod of mods) {
    let modid = (mod.owner + ":" + mod.module + ":" + mod.version)
    if (module_list.modules.some(l => l.id == modid)) continue
    db.refresh()
    let mod_data = await createModule({owner: mod.owner, name: mod.module}, (c)=>{})

    for (let [catName, cat] of Object.entries(mod_data.extraction.get())) {
      catName = safe(catName)
      for (let [subcatName, subcat] of Object.entries(cat)) {
        subcatName = safe(subcatName)
        let dir = `${path}/${modid}/en/data/${catName}/${subcatName}`
        await mkdir(dir, {recursive: true})
        for (const [itemName, item] of Object.entries(subcat)) {

          let itemParams:ItemParams= {
            id: `${modid}_${catName}_${subcatName}_${itemName}`,
            name: itemName,
            sort_order: 0,
            depiction: item.depiction,
            taxonomy: { category: catName, subcategory: subcatName }
          }
          await writeFile(`${dir}/${safe(itemName)}.json`, stringify(itemParams))
        }
      }
    }

    let taxonomyParams : TaxonomyParams = {
      taxonomy: {
        categories: Object.entries(mod_data.extraction.get()).map(([catName, cat])=>({
          id: safe(catName),
          name: catName,
          sort_order: 0,
          description: "",
          subcategories: Object.keys(cat).map((subcatName)=>({
            id: safe(subcatName),
            name: subcatName,
            sort_order: 0,
            description: "",
          }))
        }))
      }
    };

    await mkdir(`${path}/${modid}/en`, {recursive: true})
    await writeFile( path + `/${modid}/en/taxonomy.json`, stringify(taxonomyParams))

    const configParams: ConfigParams = {
      sections: [
        { name: "title", sort_order: 0 },
        { name: "content", sort_order: 1 }
      ],
      filters: [],
      category_search_fields: ["name", "description"],
      data_search_fields: ["name", "depiction"],
      fields: [
        {
          key:"name",
          display_option: "header",
          sort_order: 0,
          section: "title"
        },
        {
          key:"depiction",
          display_option: "default",
          sort_order: 1,
          section: "content"
        }
      ],
      form_field_override: [],
      default_field_option: {
        key: "any",
        sort_order: 0,
        display_option: "hidden",
        section: "content"
      }
    }
    await writeFile( path + `/${modid}/en/config.json`, stringify(configParams))
    module_list.modules.push({ id: modid, name: modid, sort_order:0, module_type: "demo", location: modid, downloaded: true })
    await writeFile( path + "/modules.json", stringify(module_list))

  }


  // console.log(`Pulled ${mods.length} modules`)
  for (const mod of module_list.modules){
    if (mod.downloaded && !mods.some(m => (`${m.owner}:${m.module}:${m.version}`) == mod.id)) {
      console.log(`Module ${mod.id} is in modules.json but not in database, removing...`)

      await rm(`${path}/${mod.id}`, {recursive: true})
      module_list.modules = module_list.modules.filter(m => m.id != mod.id)
      await writeFile( path + "/modules.json", stringify(module_list))

    }
  }

  setTimeout(() => { loop() }, 500);

}

if (!path || !path.endsWith("json_content")) console.error("Usage: node scripts/pull_module.js <path_to_json_content_folder>")
else loop()
