// import { mkRunner } from "../controller/functions";
import { mkRunner } from "../controller/agent";
import { createModule, db } from "../controller/module";
import { runTests } from "./test";

console.log("Running agent tests")

let module = await createModule({name: "test", owner: db.userid}, mod=>{
  console.log("Module updated", mod)
})


module.taxonomy.set({categories: {}})
console.log("Functions in module:", Object.keys(module.functions.get()));

let getfunc = (f:string) => mkRunner(module, module.functions.get()[f]!)
let viewTaxonomy = getfunc("viewTaxonomy")
let addCategory = getfunc("addCategory")
let addSubcategory = getfunc("addSubcategory")

console.log("Initial taxonomy", await viewTaxonomy({}))


let categories = [
  "Legal",
  "Financial",
  "Technical",
  "Personal",
  "Investment",
  "Health",
  "Education",
  "Entertainment",
  "Travel",
  "Food"
]



await runTests(
  async function testAddCategory(){
    for (let cat of categories) {
      await addCategory({categoryName: cat})
    }
  }
)


db.disconnect()



