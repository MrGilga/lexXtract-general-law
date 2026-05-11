import { LocalStored, type Store } from "../model/db";
import { validateSchema, type Pattern } from "../model/pattern";
import type { Agent, FunctionParams, JsonData, Message, Module } from "../model/types";
import { runTool } from "./functions";
import { chat, type ModelMessage, type ModelTool } from "./request";


export const MessagePattern: Pattern = [
  { role: ["system", "user", "assistant"], content: String },
  { type: "function_call", id: String, call_id: String, name: String, arguments: String },
  { type: "function_call_output", call_id: String, output: String }
]

export let cost_tracker = LocalStored<number>("cost_tracker", Number)

export const AgentPattern : Pattern = {
  id: String,
  tools: [String],
  msgs_ctr: Number,
}


export type AgentTemplate = {
  name: string,
  description?: string,
  prompt: string,
  tools: string[]
}


const _get_agent = (mod:Module, agent_id: string) => mod.db<Agent>(agent_id, AgentPattern)
const _get_msg = (mod:Module, agent_id: string, msg_ctr: number, upsertValue?: Message) => mod.db<Message>(agent_id+"_msg_"+msg_ctr, MessagePattern, {upsertValue})

const _storeMessage = async (mod: Module, agent_id: string, msg: Message) => {
  let ag = await mod.db<Agent>(agent_id, AgentPattern);
  let ctr = ag.get().msgs_ctr;
  await _get_msg(mod, agent_id, ctr, msg)
  ag.update(x=>{x.msgs_ctr = ctr+1; return x})
  return ctr
}

export const agentCollection = (mod: Module) => mod.db<string[]>("agent_collection", [String])

export const startAgent = async (mod: Module, prompt: string, tools:string[]) =>{
  let id = "agent_" + Math.random().toString(16).slice(2)
  agentCollection(mod).then(c=> c.update(col=> [...col, id]))

  let ag = await _get_agent(mod, id)
  ag.set({ id, msgs_ctr: 0, tools})
  await _storeMessage(mod, id, {role: "system", content: prompt})
  return id
}

export const msgAgent = async (mod: Module, agent_id: string, msg: string, role: "user" | "system" = "user") => {
  await _storeMessage(mod, agent_id, {role, content: msg})
  runagent(mod, agent_id)
}

export const runningAgents = LocalStored<string[]>("running_agents", [String], [])
runningAgents.set([])

export const runagent = async (mod: Module, agent_id: string): Promise<ModelMessage> => {
  let ag = await _get_agent(mod, agent_id)
  let hist: Message[] = await Promise.all( Array.from({length:ag.get().msgs_ctr}).map((_,i)=>_get_msg(mod, agent_id, i).then(x=>x.get())))
  let tools: ModelTool[] = Object.entries(mod.functions.get()).filter(([name])=> ag.get().tools.includes(name)).map(([name, def])=>(
    {
      type: "function",
      name,
      description: def.description || "",
      parameters: {type: "object", properties: def.parameters, required: Object.keys(def.parameters)},
    } as ModelTool
  ))
  runningAgents.update(a=> a.includes(agent_id) ? a : [...a, agent_id])
  return chat(hist, "moonshotai/kimi-k2.6", tools).then(async r=>{
    cost_tracker.set(cost_tracker.get() + r.cost)
    let proms: Promise<void>[] = [];
    let outputs = new Map<string, (m:ModelMessage)=>void>();
    for (let msg of r.messages){
      let mid = await _storeMessage(mod, agent_id, msg)
      if ("type" in msg && msg.type == "function_call_output")
        outputs.set(msg.call_id, cres => _get_msg(mod, agent_id, mid, cres))
    }
    for (let msg of r.messages){
      if ("type" in msg && msg.type == "function_call"){
        proms.push(runTool(mod, msg.name, JSON.parse(msg.arguments))
        .then(ret=> outputs.get(msg.call_id)!({type: "function_call_output", call_id: msg.call_id, output: JSON.stringify(ret) ?? "OK"})))
      }
      
    }
    await Promise.all(proms)
    runningAgents.update(a=> a.filter(id=> id != agent_id))
    if (proms.length) return await runagent(mod, agent_id)
    else {return r.messages[r.messages.length-1]!}
  })
}

export const viewAgent = (mod: Module, agent_id: string, onMsg: (msg: Store<Message>)=>void)=>{
  let msgc = 0
  mod.db<Agent>(agent_id, AgentPattern).then(ag=>{
    console.log("Viewing agent", msgc,  agent_id, ag.get().msgs_ctr)
    let update = async (ag: Agent)=>{
      let proms : Promise<Store<Message>>[] = []
      while(msgc < ag.msgs_ctr){
        let c= msgc;
        proms.push(_get_msg(mod, agent_id, c))
        msgc++
      }
      await Promise.all(proms).then(msgs=>msgs.forEach(onMsg))
    }
    ag.onupdate(update)
  })
}



