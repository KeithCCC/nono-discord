import type { Agent, Channel, Issue, Message, Workspace } from "../models";

export const STORAGE_KEY = "openclaw.issueConsole.workspace.v1";

const now = () => new Date().toISOString();

const makeChannel = (
  id: string,
  name: string,
  description: string,
  kind: Channel["kind"],
  defaultAgentId: string,
): Channel => ({
  id,
  name,
  description,
  kind,
  routing: {
    defaultAgentId,
    allowedAgentIds: ["coder-agent", "research-agent", "support-agent", "organizer-agent"],
    adapter: "local",
  },
  createdAt: now(),
  updatedAt: now(),
});

const agents: Agent[] = [
  { id: "coder-agent", name: "Coder Agent", role: "coder", status: "online" },
  { id: "research-agent", name: "Research Agent", role: "researcher", status: "online" },
  { id: "support-agent", name: "Support Agent", role: "support", status: "idle" },
  { id: "organizer-agent", name: "Organizer Agent", role: "organizer", status: "online" },
];

const channels: Channel[] = [
  makeChannel("channel-dev", "dev", "Implementation tasks, build failures, and code review follow-up.", "team", "coder-agent"),
  makeChannel("channel-research", "research", "Source gathering, comparisons, and evidence-backed investigation.", "team", "research-agent"),
  makeChannel("channel-support", "support", "Operational support, triage, and external request follow-up.", "team", "support-agent"),
  makeChannel("channel-memo", "memo", "Notes that may become tasks, issues, or long-term memory.", "team", "organizer-agent"),
  makeChannel("channel-backlog", "backlog", "Unscheduled work and ideas waiting for prioritization.", "queue", "organizer-agent"),
  makeChannel("channel-daily-ai-lab", "daily-ai-lab-ai-news-daily", "Morning AI news candidate job and related run issues.", "job", "research-agent"),
  makeChannel("channel-youtube-tips", "youtube-prompt-tips-daily", "Daily YouTube prompt tips digest job.", "job", "research-agent"),
  makeChannel("channel-openclaw-youtube", "openclaw-youtube-news-daily", "OpenClaw YouTube news watch job.", "job", "research-agent"),
  makeChannel("channel-openclaw-summary", "Nightly OpenClaw Daily activity summary", "Nightly activity summary and handoff job.", "job", "organizer-agent"),
  makeChannel("channel-memedit-morning", "memedit morning summary", "Morning Memedit summary, reminders, and memory surfacing.", "job", "organizer-agent"),
];

const issues: Issue[] = [
  {
    id: "issue-ai-news-timeout",
    channelId: "channel-daily-ai-lab",
    title: "Bound daily AI news fetches to prevent idle timeouts",
    summary: "Recent daily run stalled while reading oversized web content. Keep fetches small and save useful candidates early.",
    status: "working",
    priority: "high",
    tags: ["cron", "ai-news", "timeout"],
    assignedAgentId: "research-agent",
    createdAt: now(),
    updatedAt: now(),
  },
  {
    id: "issue-youtube-claude-filter",
    channelId: "channel-youtube-tips",
    title: "Keep Claude Code videos out of prompt tips digest",
    summary: "The metadata-only YouTube prompt tips digest should skip Claude Code videos even if that leaves fewer picks.",
    status: "open",
    priority: "normal",
    tags: ["youtube", "digest", "filter"],
    assignedAgentId: "research-agent",
    createdAt: now(),
    updatedAt: now(),
  },
  {
    id: "issue-nightly-summary-format",
    channelId: "channel-openclaw-summary",
    title: "Tighten nightly activity summary into issue-ready bullets",
    summary: "Summaries should separate completed work, open blockers, and next suggested actions.",
    status: "waiting",
    priority: "normal",
    tags: ["summary", "handoff"],
    assignedAgentId: "organizer-agent",
    createdAt: now(),
    updatedAt: now(),
  },
  {
    id: "issue-memedit-morning-focus",
    channelId: "channel-memedit-morning",
    title: "Scan Focus notes before building morning summary",
    summary: "Morning Memedit summaries should include active Focus notes before lower-priority material.",
    status: "open",
    priority: "high",
    tags: ["memedit", "focus", "morning"],
    assignedAgentId: "organizer-agent",
    createdAt: now(),
    updatedAt: now(),
  },
  {
    id: "issue-console-adapters",
    channelId: "channel-dev",
    title: "Keep issue console adapter-neutral",
    summary: "The console should not depend on Discord. Keep models ready for future Discord, CLI, and Teams adapters.",
    status: "working",
    priority: "urgent",
    tags: ["architecture", "mvp"],
    assignedAgentId: "coder-agent",
    createdAt: now(),
    updatedAt: now(),
  },
  {
    id: "issue-backlog-routing-rules",
    channelId: "channel-backlog",
    title: "Design routing rules for channels and issue assignment",
    summary: "Channels need default agents now, then richer routing later once OpenClaw Agent API hooks exist.",
    status: "open",
    priority: "low",
    tags: ["routing", "future-api"],
    assignedAgentId: "organizer-agent",
    createdAt: now(),
    updatedAt: now(),
  },
];

const messages: Message[] = [
  {
    id: "msg-ai-news-1",
    issueId: "issue-ai-news-timeout",
    kind: "system",
    authorName: "OpenClaw",
    body: "Imported from daily-ai-lab-ai-news-daily cron history.",
    createdAt: now(),
  },
  {
    id: "msg-ai-news-2",
    issueId: "issue-ai-news-timeout",
    kind: "agent",
    authorId: "research-agent",
    authorName: "Research Agent",
    body: "Suggested guardrails: bounded source fetches, early candidate selection, and save/push once enough items are ready.",
    createdAt: now(),
  },
  {
    id: "msg-console-1",
    issueId: "issue-console-adapters",
    kind: "user",
    authorName: "Keith",
    body: "Build this as a standalone issue console. Discord integration can come later.",
    createdAt: now(),
  },
  {
    id: "msg-console-2",
    issueId: "issue-console-adapters",
    kind: "agent",
    authorId: "coder-agent",
    authorName: "Coder Agent",
    body: "Model includes Workspace, Channel, Issue, Message, Agent, and Routing so UI data is not tied to a chat provider.",
    createdAt: now(),
  },
];

export function createSeedWorkspace(): Workspace {
  return {
    id: "openclaw-local-workspace",
    name: "OpenClaw Issue Console",
    channels,
    issues,
    messages,
    agents,
    updatedAt: now(),
  };
}

export function loadWorkspace(): Workspace {
  const fallback = createSeedWorkspace();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Workspace;
    if (!parsed.channels || !parsed.issues || !parsed.messages || !parsed.agents) return fallback;
    return parsed;
  } catch {
    return fallback;
  }
}

export function saveWorkspace(workspace: Workspace): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...workspace, updatedAt: now() }));
}

export function resetWorkspace(): Workspace {
  const seeded = createSeedWorkspace();
  saveWorkspace(seeded);
  return seeded;
}
