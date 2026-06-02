import type { Agent, Issue, Message } from "../models";

export interface AgentReplyInput {
  issue: Issue;
  agent: Agent;
  userMessage: Message;
  recentMessages?: Message[];
}

export async function requestAgentReply(input: AgentReplyInput): Promise<Omit<Message, "id" | "createdAt">> {
  const response = await window.fetch("/api/nono-discord/agent/reply", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      issue: input.issue,
      agent: input.agent,
      userMessage: input.userMessage,
      recentMessages: input.recentMessages ?? [],
    }),
  });

  if (!response.ok) {
    let detail = `Nono call failed: ${response.status}`;
    try {
      const payload = (await response.json()) as { detail?: string; error?: { message?: string } };
      detail = payload.detail ?? payload.error?.message ?? detail;
    } catch {
      // Keep the status-based error.
    }
    throw new Error(detail);
  }

  const payload = (await response.json()) as { message: Omit<Message, "id" | "createdAt"> };
  return payload.message;
}
