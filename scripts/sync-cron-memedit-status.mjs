import fs from "node:fs";
import path from "node:path";

const JOBS_PATH = process.env.OPENCLAW_CRON_JOBS_PATH ?? "/root/.openclaw/cron/jobs.json";
const STATE_PATH = process.env.OPENCLAW_CRON_STATE_PATH ?? "/root/.openclaw/cron/jobs-state.json";
const WORKSPACE_PATH = process.env.NONO_DISCORD_WORKSPACE_PATH ?? "/srv/nono-discord-data/workspace.json";
const CHANNEL_ID = "channel-cron-memedit-notes";
const SYNC_AUTHOR = "Cron Status Sync";

const readJson = (filePath, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
};

const now = () => new Date().toISOString();
const iso = (value) => (value ? new Date(value).toISOString() : "not recorded");

const defaultAgents = [
  { id: "coder-agent", name: "Coder Agent", role: "coder", status: "online" },
  { id: "research-agent", name: "Research Agent", role: "researcher", status: "online" },
  { id: "support-agent", name: "Support Agent", role: "support", status: "idle" },
  { id: "organizer-agent", name: "Organizer Agent", role: "organizer", status: "online" },
];

const createWorkspace = () => ({
  id: "openclaw-local-workspace",
  name: "OpenClaw Issue Console",
  channels: [],
  issues: [],
  messages: [],
  agents: defaultAgents,
  updatedAt: now(),
});

const hasMemeditNoteIntent = (job) => {
  const text = `${job.name ?? ""}\n${job.description ?? ""}\n${job.payload?.message ?? ""}`;
  return /memedit|note service|daily note/i.test(text);
};

const statusFor = (job, state) => {
  if (!job.enabled) return "waiting";
  if (state?.lastStatus === "error" || state?.lastRunStatus === "error") return "blocked";
  if (state?.lastStatus === "ok" || state?.lastRunStatus === "ok") return "working";
  return "open";
};

const priorityFor = (state) => {
  const errors = Number(state?.consecutiveErrors ?? 0);
  if (errors >= 3) return "urgent";
  if (errors > 0 || state?.lastStatus === "error" || state?.lastRunStatus === "error") return "high";
  return "normal";
};

const describeSchedule = (job) => {
  const schedule = job.schedule ?? {};
  if (schedule.kind === "cron") return `${schedule.expr} (${schedule.tz ?? "local"})`;
  if (schedule.kind === "at") return `one-shot at ${schedule.at}`;
  return schedule.kind ?? "unscheduled";
};

const issueSummary = (job, state) => {
  const last = state?.lastRunStatus ?? state?.lastStatus ?? "unknown";
  const nextRun = state?.nextRunAtMs ? iso(state.nextRunAtMs) : "not scheduled";
  return `Enabled: ${job.enabled ? "yes" : "no"}. Last status: ${last}. Next run: ${nextRun}.`;
};

const messageBody = (job, state) => {
  const lines = [
    `Current cron status snapshot for ${job.name}.`,
    "",
    `Job ID: ${job.id}`,
    `Enabled: ${job.enabled ? "yes" : "no"}`,
    `Schedule: ${describeSchedule(job)}`,
    `Last run: ${iso(state?.lastRunAtMs)}`,
    `Last status: ${state?.lastRunStatus ?? state?.lastStatus ?? "unknown"}`,
    `Last duration: ${state?.lastDurationMs ? `${Math.round(state.lastDurationMs / 1000)}s` : "not recorded"}`,
    `Next run: ${state?.nextRunAtMs ? iso(state.nextRunAtMs) : "not scheduled"}`,
    `Consecutive errors: ${state?.consecutiveErrors ?? 0}`,
  ];
  const diagnostic = state?.lastDiagnosticSummary ?? state?.lastError;
  if (diagnostic) {
    lines.push("", `Latest diagnostic: ${diagnostic}`);
  }
  return lines.join("\n");
};

const ensureChannel = (workspace) => {
  const existing = workspace.channels.find((channel) => channel.id === CHANNEL_ID);
  const patch = {
    name: "cron-memedit-notes",
    description: "Current OpenClaw cron jobs that create or update Memedit notes.",
    kind: "job",
    routing: {
      defaultAgentId: "organizer-agent",
      allowedAgentIds: workspace.agents.map((agent) => agent.id),
      adapter: "local",
    },
  };
  if (existing) {
    Object.assign(existing, patch, { updatedAt: now() });
    return existing;
  }
  const channel = {
    id: CHANNEL_ID,
    ...patch,
    createdAt: now(),
    updatedAt: now(),
  };
  workspace.channels.push(channel);
  return channel;
};

const upsertIssue = (workspace, job, state) => {
  const issueId = `issue-cron-${job.id}`;
  const current = workspace.issues.find((issue) => issue.id === issueId);
  const patch = {
    channelId: CHANNEL_ID,
    title: job.name,
    summary: issueSummary(job, state),
    status: statusFor(job, state),
    priority: priorityFor(state),
    tags: ["cron", "memedit", "status", ...(job.enabled ? ["enabled"] : ["disabled"])],
    assignedAgentId: "organizer-agent",
    updatedAt: now(),
  };
  if (current) {
    Object.assign(current, patch);
  } else {
    workspace.issues.push({
      id: issueId,
      ...patch,
      createdAt: now(),
    });
  }
  workspace.messages = workspace.messages.filter(
    (message) => !(message.issueId === issueId && message.authorName === SYNC_AUTHOR),
  );
  workspace.messages.push({
    id: `msg-cron-status-${job.id}`,
    issueId,
    kind: "system",
    authorName: SYNC_AUTHOR,
    body: messageBody(job, state),
    createdAt: now(),
  });
};

const jobsFile = readJson(JOBS_PATH, { jobs: [] });
const stateFile = readJson(STATE_PATH, { jobs: {} });
const workspace = readJson(WORKSPACE_PATH, createWorkspace());

workspace.agents = workspace.agents?.length ? workspace.agents : defaultAgents;
workspace.channels = workspace.channels ?? [];
workspace.issues = workspace.issues ?? [];
workspace.messages = workspace.messages ?? [];

ensureChannel(workspace);

const jobs = (jobsFile.jobs ?? []).filter(hasMemeditNoteIntent);
const syncedIssueIds = new Set(jobs.map((job) => `issue-cron-${job.id}`));
workspace.issues = workspace.issues.filter(
  (issue) => issue.channelId !== CHANNEL_ID || syncedIssueIds.has(issue.id),
);
workspace.messages = workspace.messages.filter(
  (message) => !message.issueId.startsWith("issue-cron-") || syncedIssueIds.has(message.issueId),
);
for (const job of jobs) {
  upsertIssue(workspace, job, stateFile.jobs?.[job.id]?.state ?? {});
}

workspace.updatedAt = now();

fs.mkdirSync(path.dirname(WORKSPACE_PATH), { recursive: true });
fs.writeFileSync(WORKSPACE_PATH, `${JSON.stringify(workspace, null, 2)}\n`);

const blocked = workspace.issues.filter((issue) => issue.channelId === CHANNEL_ID && issue.status === "blocked").length;
console.log(`Synced ${jobs.length} Memedit cron jobs to ${WORKSPACE_PATH}. Blocked: ${blocked}.`);
