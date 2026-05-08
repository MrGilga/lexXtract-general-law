import type { Agent } from "../model/types";


// export type AgentMaker = (prompt: string, tools: string[]) => () => Promise<Agent>

export const AgentMaker = (prompt: string, tools: string[]) => async () => {
  return {
    id: "agent_" + Math.random().toString(16).slice(2),
    tools,
    msgs_ctr: 0
  }
}
