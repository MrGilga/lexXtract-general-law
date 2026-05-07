import { msgAgent, startAgent, viewAgent } from "../controller/agent"
import type { Module } from "../model/types"
import { button, color, div, h2, input, p, popup, style } from "./html"
import { jsonView, viewer } from "./json"


export const mkAgent = async (module:Module)=>{
  let mkButton = (text:string, onclick:()=>void):HTMLButtonElement=>
    button(text,{onclick, style:{background:color.gray,border:"unset",color:color.color,padding:".5em 1em",borderRadius:".3em",cursor:"pointer",margin:"0 0.5em"} })

  let chats = await  module.db<string[]>("past_agents", [String])
  let newChat = async ()=>
    startAgent(module, module.prompt.get() || "", Object.keys(module.functions.get()))
    .then(n=> chats.update(c=>[...c, n]))
  let chatel = div()
  let panel = div(
    style({
      position: "sticky",
      top: ".5em",
      left: "50%",
      background: color.background,
      padding: "1em",
    }),
    mkButton("new chat", newChat),
    mkButton("settings", ()=>popup(div(
      h2("agent settings"),
      p("prompt:"),
      viewer(module.prompt),
      p("functions:"),
    )))
  )

  let el = div( panel, chatel)
  let hint = p("...")


  let showChat = (id:string)=>{
    console.log("showing chat", id)
    let loader =p("loading chat", )
    chatel.replaceChildren(loader)
    
    viewAgent(module,id, msg=>{
      loader.remove()
      let d = msg.get()
      let role = ("role" in d) ? d.role : "output"
      let m = div(
        style({
          fontWeight: role == "user" ? "bold" : "normal",
          display: role == "system" ? "none" : "block",
          padding: "0.5em",
          paddingLeft: role == "user" ? "0" : "1em",

        }),
        ("content" in d ? d.content : d.type == "function_call" ? `[function call: ${d.name}]` : `[function output: ${d.output.slice(0,100)}]`),
        {onclick:()=>popup(div(p("message content"), jsonView(d)))}
      )
      chatel.append(m)
      hint.remove()
    })

    let intake = input({placeholder:"message",
      style:{ width:"40vw", position: "fixed", bottom:"1em", fontSize:"1.1em", padding:"0.5em 1em", borderRadius:".4em", border:`4px solid ${color.gray}`, background: color.lightgray, color: color.color },
      onkeydown: e=>{
        if (e.key == "Enter")
          msgAgent(module, id, intake.value).then(()=>{
            intake.value = ""
            chatel.append(hint)
          })
       }
    })
    chatel.append(intake)
  }
  if (chats.get().length == 0) await newChat()
  let update =()=>showChat(chats.get()[chats.get().length-1]!)
  update()
  chats.onupdate(update)

  return el;

}



