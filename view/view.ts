import  type { FunctionParams, JsonData, JSONSchema, ExtractionItem } from "../model/types";
import { type ModPath } from "../model/types";

import { createModule, db, FunctionDefPattern, ModPathPattern  } from "../controller/module";
import { LocalStored, randUser } from "../model/db";
import { hash } from "../model/hash";
import { localApiKey } from "../controller/request";
import { background, body, button, color, display, div, errorpopup, fromStore, h1, h2, h3, input, margin, p, padding, popup, pre, span, style, table, td, tr, width } from "./html";
import { jsonView, viewer } from "./json";
import { fill, fromSchema, type Pattern } from "../model/pattern";
import { cost_tracker } from "../controller/agent";
import { mkAgent } from "./agent";
import { runTool } from "../controller/functions";


let urlrequest:ModPath | null = null

body.style.margin = "0"


let currentModuleButton = button("loading", style({fontSize: "1.3em", margin: "0"}))

let header = div(
  style({
    background: color.blue,
    color: color.background,
    padding:"1.5em",
  }),
  span(style({
    backgroundImage: "url(http://localhost:5174/lexXtract-general-law/image.png)",
    backgroundSize: "contain",
    backgroundRepeat: "no-repeat",
    width: "14em",
    height: "4em",
    display: "inline-block",
  })),
  div(
    style({
      display: "inline-block",
      right: "1em",
      position: "absolute",
      fontSize: "0.9em",
    }),
    p("Select a module", style({margin:"0"})),
    currentModuleButton,
  )
)
const moduleHeader = h2("Module: loading...")
const sidebar = div(
  style({
    width:"200px",
    height:"calc(100vh - 1em)",
    position:"sticky",
    top:"1em",
    alignSelf:"flex-start",
    padding:"1em",
  }),
  moduleHeader
)

let page = div(style({
  marginTop:"1em",
  display:"flex",
  flexDirection:"column",
}))
body.replaceChildren(header, page)



location.search.split("&").forEach(param=>{
  if (param.startsWith("?")) param = param.slice(1)
  console.log("URL param:", param)
  let [key, value] = param.split("=")
  if (key == "module" && value){
    try {
      urlrequest = JSON.parse(decodeURIComponent(value)) as ModPath;
      console.log("Module request from URL:", urlrequest)
    }
    catch(e) {console.error("Failed to parse module from URL", e)}
  }
})


let accountsettings = {
  changePassword : db.changePassword,
  signup : (args:{userid:string, passhash:string})=>db.signup(args).then(loadUser),
  getItem: (key:string, pattern:Pattern, owner?:string)=>{
    owner ||= db.userid
    return db.get(key, pattern, {owner})
  }
}


let loadUser = async ()=>{


  let module_list = await db.get<ModPath[]>("modules", [ModPathPattern])

  let current_module = await db.get<ModPath>("current_module", ModPathPattern ,{ upsertValue: urlrequest ? urlrequest : undefined } )

  const show_module = async (mod:ModPath) => {

    let module = await createModule(mod, mkcopy=>{
      let pop = popup(
        h3("Module is read-only"),
        p("This module belongs to another user and cannot be edited directly. Would you like to create a copy of this module in your account that you can edit?"),
        button("Yes, create a copy", {onclick:()=>{mkcopy().then(show_module); pop.remove()}}))
    });

    const Taxonomy = viewer(module.taxonomy)
    const Documents = div(viewer(module.documents), button("+add", {
      onclick:()=>{
        let title = prompt("doc title")
        if (title) module.documents.set({...module.documents.get() , [title] : "content"})
      }
    }))
  

    let Agent = await mkAgent(module)
  
    let Settings =div()
    let mksettings =()=> {
      let pwd = input({type:"password", placeholder:"new password"})
      let apikey = input({ type:"password", placeholder:"new API key"})
      Settings.replaceChildren (div(
        h3("Account Settings"),
        table(
          style({borderSpacing: "0.5em",}),
          tr(
            td("user id: "),
            td(db.userid ?? "<none>"),
            td(
              button("logout", {onclick:()=>accountsettings.signup(randUser())}),
              button("switch account", {
                style:{marginLeft:"0.5em"},
                onclick:()=>{
                  let userid = input({placeholder:"user id"})
                  let pwd = input({type:"password", placeholder:"password"})
                  let pop = popup(
                    h3("switch account"),
                    table(
                      style({borderSpacing: "0.5em",}),
                      tr(td("user id: "),td(userid),),
                      tr(td("password: "),td(pwd),),
                      tr(td(),td(button("login", {onclick:()=>{accountsettings.signup({userid: userid.value, passhash: hash(pwd.value)})}}))),
                    )
                  )
            }}))
          ),
          tr(
            td("Add API Key: "),
            td(apikey),
            td(button("set", {onclick:()=>{localApiKey.set(apikey.value); apikey.value = ""}}))
          ),
          tr(
            td("Change Password: "),
            td(pwd),
            td(button("set", {onclick:()=>{
              db.changePassword(pwd.value).then(()=>{
                alert("password updated.")
                pwd.value = ''
              })
            }}))
          ),
        ),
        cost_tracker.map(c=>"usage: " + c.toFixed(4)),
        div(
          h3("publishing"),
          p("Publishing your module makes it visible to customers on the ETKOM App"),
          button("publish", {
            onclick:()=>{
              let vinput = input({placeholder:"v1.0"})
              let pop = popup(
                h2("Publish: ", mod.owner, "/", mod.name), 
                p("Publishing your module makes it visible to customers on the ETKOM App"),
                
                span("version: ", vinput),
                button("Publish", {
                  onclick:()=>{
                    db.publish(mod.owner, mod.name, vinput.value || vinput.placeholder, false )
                    .then(()=>{
                      pop.remove()
                      popup(h2("Pulished successfully!"), p("Module: ", mod.owner, "/", mod.name, " version: ", vinput.value || vinput.placeholder), )})
                    .catch(e=>errorpopup(e as Error))

                  }
                }),
                db.get_published().then( mods=>mods.length == 0 ? [] : [
                    p("past versions:"),
                    table(mods.filter(m=>m.module == mod.name && m.owner == mod.owner).map(m=>
                      tr(
                        td(m.version),
                        td(button("unpublish", {
                        onclick:()=>{
                          if (confirm("Are you sure you want to unpublish this version? This action cannot be undone.")){
                            db.publish(m.owner, m.module, m.version, true)
                            pop.remove()
                          }
                        }
                      })))
                    ))
                ]),
              )
            }
          })
        )
      ))
                
    }
    mksettings()


    let Functions = viewer(module.functions, d=>{
      return div(Object.entries(d as {[key:string]: FunctionParams}).map(([k,v])=>
      {
        let details = div(style({
          paddingLeft: "1em",
        }))
        return div(
          h3(k,
            button("call", {
              onclick:()=>{

                let argsSchema = {type: "object", properties: v.parameters, required: Object.keys(v.parameters)} as JSONSchema
                let args = fill(fromSchema(argsSchema)) as {[par:string]: JsonData}
                
                let pop = popup(
                  h2("call "+ k),
                  v.description? p(v.description) : [],
                  h3("arguments"),
                  viewer({
                    get: ()=>args,
                    set: async (a:{[par:string]:JsonData})=>{args = a},
                    pattern: fromSchema(argsSchema),
                  }),
                  button("execute", {
                    onclick:async ()=>{
                      
                      try{
                        pop.remove()
                        pop = popup(h2("executing "+k+ "..."))
                        // let res = await mkRunner(module, v)(args)
                        let res = await runTool(module, k, args)
                        pop.remove()
                        pop = popup(h2("result"), jsonView(res))
                      }catch(e){
                        errorpopup(e as Error)
                      }
                    }
                  })
                )
              }
            }),
            button("details", {onclick:()=>{
              if (details.childElementCount == 0){
                details.append(viewer({
                  get: ()=>v,
                  set: async (a:FunctionParams)=>module.functions.update(fs=>({...fs, [k]: a})),
                  pattern: FunctionDefPattern
                }))
              }else{
                details.replaceChildren()
              }
            }})
          ),
          p(v.description || ""),
          details,
        )
      }
    ))
    })

    
    const sections : {[key:string]: HTMLElement} = {
      // Taxonomy,
      Documents,
      "Data Explorer": viewer(
        module.extraction, (j,pt,onc)=> jsonView(j, pt, onc, (j,pp, onc)=>jsonView(
            j, pp, onc, (j, ppp, onc)=>{
              let d = j as {[key:string]: ExtractionItem}
              
              return div(
                Object.entries(d).map(([key, item])=> div(
                  {style:{
                    marginLeft: "2em",
                    border: `1px solid ${color.gray}`,
                    borderRadius: "1em",
                    marginBottom: "1em",
                    padding: "1em",
                  },},
                  p(style({fontWeight:"bold"}), key),
                  jsonView(item.depiction, [...ppp ?? [], key, "depiction"], onc),
                  item.sources.length ? button(item.sources.length +" sources", {onclick:()=>{
                    popup(
                      h2("sources for "+key),
                      ...item.sources.map((s, i)=>div(
                        p(style({fontWeight:"bold"}), "source "+(i+1)),
                        jsonView(s, [...ppp ?? [], key, "sources", String(i)], onc)
                      ))
                    )
                  }}) : [],
                ))
              )
            }
          ))
        ),
      Agent,
      // Functions,
      Settings,
    }
  
    let defaultSection = LocalStored<string>("default_section", String, "Agent")
  
    let content = div()
  
    let contentbar = div(
      style({
        display:"flex",
        flexDirection:"column",
        gap:"1em",
        padding:"1em",
        minWidth:"0",
        flex:"1",
      }),
      content
    )


    let headbutton = (text:string, onclick:()=>void):HTMLElement=>span(text, {
      style:{
        cursor:"pointer",
        marginLeft:"1em",
        fontSize:"0.8em",
        color:color.gray,
        border:`1px solid ${color.gray}`,
        padding:"0.2em",
        borderRadius:".3em",
        background: color.background,
      },
      onclick})
    let share = headbutton("🔗", ()=>{
          navigator.clipboard.writeText("https://dkormann.github.io/lexXtract-general-law/"+"?module="+encodeURIComponent(JSON.stringify(mod)))
          share.textContent = "✅copied!"
          setTimeout(() => {share.textContent = "🔗"}, 1000)
          });
  
    // let sidebar = div()
    moduleHeader.replaceChildren(span((mod.owner == db.userid ? "" : mod.owner + " / ") + (mod.name || "unnamed module")), share)
    let renderSideBar = (item:string) =>{
      defaultSection.set(item)
      return sidebar.replaceChildren(
        moduleHeader,
        div(
          style({}),
          ...Object.entries(sections).map(([k,v])=>{
            if (item == k) content.replaceChildren(v)
            return h3(k, {
              style:{
                cursor:"pointer",
                margin:0,
                padding:".4em",
                ...(item == k ? {
                  background: color.lightgray,
                } : {})
              },
              onclick: ()=>renderSideBar(k)
            })
          })
        )
      )
    }
    if (defaultSection.get() in sections) renderSideBar(defaultSection.get()!)
  


    let share_local = headbutton("🔗sharelocal", ()=>{
      navigator.clipboard.writeText(window.origin+"/lexXtract-general-law/"+"?module="+encodeURIComponent(JSON.stringify(mod)))
      share_local.textContent = "✅copied!"
      setTimeout(() => {share_local.textContent = "🔗share"}, 1000)
    });

    currentModuleButton.textContent = mod.name || "unnamed module"

    currentModuleButton.onclick = (()=>
      {
        let mods = module_list.get()
        let pop = popup(
          h3("choose a module"),
          mods.filter(m=>m.owner != "" && m.name != "").map(m=>{
            let pp =  p(
                button('-', {onclick:()=>{
                  if (confirm("Are you sure you want to delete this module? This action cannot be undone.")){
                    module_list.update(l=>l.filter(x=>JSON.stringify(x)!=JSON.stringify(m)))
                    if (current_module.get() && JSON.stringify(current_module.get()) == JSON.stringify(m)){
                      current_module.set(module_list.get()[0]!)
                    }
                    pp.remove()
                  }
                }}),
                button(m.owner,"/", m.name, {onclick:()=>{
                current_module.set(m)
                pop.remove()
              }})
            )
            return pp
          })
        )
      })
    let addmod = headbutton("➕add", ()=>{
      let name = prompt("Module name")
      if (!name) return
      let newmod = {name, owner: db.userid} as ModPath
      module_list.set([...module_list.get(), newmod])
      current_module.set(newmod)
    })
    page.replaceChildren(
      fromStore(db.saving, s=> div(
        style({position: "fixed",background: color.gray,color: color.green,zIndex: "2000",padding: "1em",borderRadius: ".5em",display: s>0 ? "block" : "none"}),
        "saving "+s+" item"+(s>1 ? "s" : "")
      )),
      div(
        // h2("lexxtract : " + (mod.owner == db.userid ? "" : mod.owner + " / ") + (mod.name || "unnamed module"),
        //   share,
        //   window.origin.includes("localhost") ? share_local : [],
        //   pickmod,
        //   addmod,
        //   headbutton("🚀publish" , ()=>{
        //     let vinput = input({placeholder:"v1.0"})
        //     let pop = popup(
        //       h2("Publish: ", mod.owner, "/", mod.name), 
        //       p("Publishing your module makes it visible to customers on the ETKOM App"),
              
        //       span("version: ", vinput),
        //       button("Publish", {
        //         onclick:()=>{
        //           db.publish(mod.owner, mod.name, vinput.value || vinput.placeholder, false )
        //           .then(()=>{
        //             pop.remove()
        //             popup(h2("Pulished successfully!"), p("Module: ", mod.owner, "/", mod.name, " version: ", vinput.value || vinput.placeholder), )})
        //           .catch(e=>errorpopup(e as Error))

        //         }
        //       }),
        //       db.get_published().then( mods=>mods.length == 0 ? [] : [
        //           p("past versions:"),
        //           table(mods.filter(m=>m.module == mod.name && m.owner == mod.owner).map(m=>
        //           tr(
        //             td(m.version),
        //             td(button("unpublish", {
        //             onclick:()=>{
        //               if (confirm("Are you sure you want to unpublish this version? This action cannot be undone.")){
        //                 db.publish(m.owner, m.module, m.version, true)
        //                 pop.remove()
        //               }
        //             }
        //           }))))
                
        //           )
        //         ]
        //       ),
        //     )
        //   })
        // ),
      ),
      div(
        style({
          display:"flex",
          flexDirection:"row",
          gap:"2em",
          alignItems:"stretch",
          width:"100%",
        }),
        div(
          style({
            borderRight:`1px solid ${color.gray}`,
          }),
          sidebar
        ),
        contentbar
      )
    )
  }
  current_module.onupdate(show_module)
}

if (typeof window !== "undefined"){loadUser()}
