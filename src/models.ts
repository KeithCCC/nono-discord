export type ChannelKind = "team" | "job" | "queue";
export type IssueStatus = "open" | "working" | "waiting" | "blocked" | "done" | "archived";
export type IssuePriority = "low" | "normal" | "high" | "urgent";
export type MessageKind = "user" | "agent" | "system";

export interface Agent {
  id: string;
  name: string;
  role: "coder" | "researcher" | "support" | "organizer";
  status: "online" | "idle";
}

export interface Routing {
  defaultAgentId?: string;
  allowedAgentIds: string[];
  adapter: "local" | "discord-ready" | "cli-ready" | "teams-ready";
}

export interface Channel {
  id: string;
  name: string;
  description: string;
  kind: ChannelKind;
  routing: Routing;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  issueId: string;
  kind: MessageKind;
  authorId?: string;
  authorName: string;
  body: string;
  createdAt: string;
}

export interface Issue {
  id: string;
  channelId: string;
  title: string;
  summary: string;
  status: IssueStatus;
  priority: IssuePriority;
  tags: string[];
  assignedAgentId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Workspace {
  id: string;
  name: string;
  channels: Channel[];
  issues: Issue[];
  messages: Message[];
  agents: Agent[];
  updatedAt: string;
}

export const ISSUE_STATUSES: IssueStatus[] = [
  "open",
  "working",
  "waiting",
  "blocked",
  "done",
  "archived",
];

export const ISSUE_PRIORITIES: IssuePriority[] = ["low", "normal", "high", "urgent"];
