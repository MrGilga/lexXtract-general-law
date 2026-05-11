import {  msgAgent, runningAgents, startAgent, viewAgent } from "../controller/agent"
import { coordinatorAgent } from "../controller/functions"

import type { Module } from "../model/types"
import { button, color, div, fromStore, h2, input, p, popup, style } from "./html"
import { jsonView, viewer } from "./json"


export const mkAgent = async (module:Module)=>{
  let mkButton = (text:string, onclick:()=>void):HTMLButtonElement=>
    button(text,{onclick, style:{background:color.lightgray,border:"unset",color:color.color,padding:".5em 1em",borderRadius:".3em",cursor:"pointer",margin:"0 0.5em"} })

  let chats = await  module.db<string[]>("past_agents", [String])
  let newChat = async ()=>
    startAgent(module, coordinatorAgent.prompt, coordinatorAgent.tools)
    .then(n=> chats.update(c=>[...c, n]))
  let chatel = div(style({
    marginBottom: "3em",
  }))
  let running = mkButton("", ()=>{})
  let showrunner = ()=>{
    running.textContent = `running agents: ${runningAgents.get().length}`
    if (runningAgents.get().length>0) running.style.animation = "pulse 2s infinite"
    else running.style.animation = "none"
  }
  showrunner()
  runningAgents.onupdate(showrunner)
  let panel = div(
    style({
      position: "sticky",
      top: ".5em",
      left: "50%",
      background: color.background,
      padding: "1em",
    }),
    mkButton("new chat", newChat),
    running,
  )

  let el = div( panel, chatel)
  let hint = p("...")


  let showChat = (id:string)=>{

    let loader =p("loading chat", )
    chatel.replaceChildren(loader)
    
    viewAgent(module,id, msg=>{
      console.log("got message from agent", msg.get())
      loader.remove()
      chatel.append(fromStore(msg, d=>{
        let role = ("role" in d) ? d.role : "output"
        return div(
          style({
            fontWeight: role == "user" ? "bold" : "normal",
            color: role == "system" ? color.gray : color.color,
            padding: "0.5em",
            paddingLeft: role == "user" ? "0" : "1em",
            whiteSpace: "pre-wrap",
          }),
          ("content" in d ? (d.role == "system" ? "[system]" : d.content) : d.type == "function_call" ? `[function call: ${d.name}]` : `[function output: ${d.output.slice(0,100)}]`),
          {onclick:()=>popup(div(p("message content"), jsonView(d)))}
        )
      }))

      hint.remove()
    })

    let intake = input({placeholder:"message",
      style:{ width:"40vw", position: "fixed", bottom:"1em", fontSize:"1.1em", padding:"0.5em 1em", borderRadius:".4em", border:`4px solid ${color.gray}`, background: color.lightgray, color: color.color },
      onkeydown: (e:KeyboardEvent)=>{
        if (e.key == "Enter"){
          chatel.append(hint)
          msgAgent(module, id, intake.value).then(()=>{ intake.value = "" })
        }
       }
    })
    chatel.append(intake)
  }
  if (chats.get().length == 0) await newChat()
  chats.onupdate(cs=>showChat(cs[cs.length-1]!))

  return el;

}



