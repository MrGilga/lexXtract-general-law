
import type { Stored } from "../model/db";
import { LocalStored } from "../model/helpers";
import { validateSchema, type Pattern } from "../model/pattern";
import type { Agent, FunctionDef, JsonData, Message, Module } from "../model/types";
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

export const startAgent = async (mod: Module, prompt: string, tools:string[]) =>{
  let id = "agent_" + Math.random().toString(16).slice(2)
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

const runagent = async (mod: Module, agent_id: string): Promise<ModelMessage> => {
  let ag = await _get_agent(mod, agent_id)
  // ag.update(a=>({...a, tools: Object.keys(mod.functions.get())}));
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

        proms.push(mkRunner(mod, mod.functions.get()[msg.name]!)(JSON.parse(msg.arguments))
        .then(ret=> outputs.get(msg.call_id)!({type: "function_call_output", call_id: msg.call_id, output: JSON.stringify(ret) ?? "OK"})))
      }
      
    }
    await Promise.all(proms)
    runningAgents.update(a=> a.filter(id=> id != agent_id))
    if (proms.length) return await runagent(mod, agent_id)
    else {return r.messages[r.messages.length-1]!}
  })
}

export const viewAgent = (mod: Module, agent_id: string, onMsg: (msg: Stored<Message>)=>void)=>{
  let msgc = 0
  mod.db<Agent>(agent_id, AgentPattern).then(ag=>{
    let update = async ()=>{
      let proms : Promise<Stored<Message>>[] = []
      while(msgc < ag.get().msgs_ctr){
        let c= msgc;
        proms.push(_get_msg(mod, agent_id, c))

        msgc++
      }
      await Promise.all(proms).then(msgs=>msgs.forEach(onMsg))
    }
    update()
    ag.onupdate(()=>(update()))})
}


export const mkRunner = (module:Module, v: FunctionDef): (args:{[key:string]:JsonData})=>Promise<JsonData> =>{

  return  async (args:{[key:string]:JsonData})=>{
    args = {...args}
    validateSchema({type: "object", properties: v.parameters, required: Object.keys(v.parameters)}, args)
    let reads = v.reads || []
    let writes = v.writes || []

    let start_agent = (prompt: string, tools:string[]) =>
      startAgent(module, prompt, tools)
      .then(agent_id=>
        runagent(module, agent_id)
        .then(resp => ({
          agent_id,
          response: ("role" in resp) ? resp.content : "Agent started. No response."
        }))
      )
    let msg_agent = (agent_id: string, msg: string) => msgAgent(module, agent_id, msg)

    new Set(reads.concat(writes))
    .forEach(cap=>{

      if (cap == "agents"){
        if (writes.includes("agents"))
          args["agents"] = {start: start_agent as any, message: msg_agent as any}
        return
      }
      let section = module[cap as keyof Module] as Stored<any>
      args[cap] = {
        ...(reads.includes(cap) ? {get: section.get as any} : {}),
        ...(writes.includes(cap) ? {set: section.set} as any : {}),
        ...(reads.includes(cap) && writes.includes(cap) ? {update: section.update} as any : {})
      }
    })

    let func = new Function(...Object.keys(args), v.code)
    return await func(...Object.values(args)) ?? "OK" as JsonData
  }
}


