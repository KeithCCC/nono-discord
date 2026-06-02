import type { Agent, Issue, Message } from "../models";

const responsesByRole: Record<Agent["role"], string> = {
  coder: "I can inspect the implementation path, propose the smallest code change, and report build/test output.",
  researcher: "I can gather sources, separate signal from noise, and return a short evidence-backed brief.",
  support: "I can triage the request, ask for missing operational context, and keep the issue moving.",
  organizer: "I can summarize the thread, update tags/status, and route the next action to the right place.",
};

export interface AgentReplyInput {
  issue: Issue;
  agent: Agent;
  userMessage: Message;
}

export async function requestMockAgentReply(input: AgentReplyInput): Promise<Omit<Message, "id" | "createdAt">> {
  await new Promise((resolve) => window.setTimeout(resolve, 250));
  return {
    issueId: input.issue.id,
    kind: "agent",
    authorId: input.agent.id,
    authorName: input.agent.name,
    body: `${responsesByRole[input.agent.role]} I saw: "${input.userMessage.body.slice(0, 140)}"`,
  };
}
