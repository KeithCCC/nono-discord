import { FormEvent, useEffect, useMemo, useState } from "react";
import type { Channel, Issue, IssuePriority, IssueStatus, Message, Workspace } from "./models";
import { ISSUE_PRIORITIES, ISSUE_STATUSES } from "./models";
import { requestAgentReply } from "./services/agentService";
import { parseSlashCommand } from "./services/commandParser";
import { loadRemoteWorkspace, loadWorkspace, resetWorkspace, saveRemoteWorkspace, saveWorkspace } from "./services/storageService";

const makeId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
const now = () => new Date().toISOString();
const formatTime = (value: string) =>
  new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));

function App() {
  const initial = loadWorkspace();
  const [workspace, setWorkspace] = useState<Workspace>(() => initial);
  const [selectedChannelId, setSelectedChannelId] = useState(initial.channels[0]?.id ?? "");
  const [selectedIssueId, setSelectedIssueId] = useState("");
  const [statusFilter, setStatusFilter] = useState<IssueStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [composer, setComposer] = useState("");
  const [newChannelName, setNewChannelName] = useState("");
  const [remoteReady, setRemoteReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState<"local" | "loading" | "synced" | "saving" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    loadRemoteWorkspace()
      .then((remote) => {
        if (cancelled) return;
        if (remote) {
          setWorkspace(remote);
          setSelectedChannelId(remote.channels[0]?.id ?? "");
          setSelectedIssueId("");
        }
        setSyncStatus(remote ? "synced" : "local");
      })
      .catch(() => {
        if (!cancelled) setSyncStatus("local");
      })
      .finally(() => {
        if (!cancelled) setRemoteReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    saveWorkspace(workspace);
    if (!remoteReady) return;
    setSyncStatus("saving");
    const timeout = window.setTimeout(() => {
      saveRemoteWorkspace(workspace)
        .then(() => setSyncStatus("synced"))
        .catch(() => setSyncStatus("error"));
    }, 450);
    return () => window.clearTimeout(timeout);
  }, [remoteReady, workspace]);

  const channel = workspace.channels.find((item) => item.id === selectedChannelId) ?? workspace.channels[0];
  const issues = useMemo(() => {
    const term = search.trim().toLowerCase();
    return workspace.issues
      .filter((issue) => issue.channelId === channel?.id)
      .filter((issue) => statusFilter === "all" || issue.status === statusFilter)
      .filter((issue) =>
        !term || [issue.title, issue.summary, issue.status, issue.priority, issue.tags.join(" ")].join(" ").toLowerCase().includes(term),
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [channel?.id, search, statusFilter, workspace.issues]);

  const issue = workspace.issues.find((item) => item.id === selectedIssueId) ?? issues[0] ?? workspace.issues[0];
  const messages = workspace.messages.filter((item) => item.issueId === issue?.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const agent = (agentId?: string) => workspace.agents.find((item) => item.id === agentId);
  const commit = (fn: (current: Workspace) => Workspace) => setWorkspace((current) => fn(current));

  const updateIssue = (issueId: string, patch: Partial<Issue>) => {
    commit((current) => ({
      ...current,
      issues: current.issues.map((item) => (item.id === issueId ? { ...item, ...patch, updatedAt: now() } : item)),
      updatedAt: now(),
    }));
  };

  const addSystemMessage = (issueId: string, body: string) => {
    const message: Message = { id: makeId("msg"), issueId, kind: "system", authorName: "OpenClaw", body, createdAt: now() };
    commit((current) => ({ ...current, messages: [...current.messages, message], updatedAt: now() }));
  };

  const createIssue = (title = "New issue") => {
    if (!channel) return;
    const next: Issue = {
      id: makeId("issue"),
      channelId: channel.id,
      title,
      summary: "Describe the desired outcome and next action.",
      status: "open",
      priority: "normal",
      tags: [],
      assignedAgentId: channel.routing.defaultAgentId,
      createdAt: now(),
      updatedAt: now(),
    };
    commit((current) => ({ ...current, issues: [next, ...current.issues], updatedAt: now() }));
    setSelectedIssueId(next.id);
    addSystemMessage(next.id, "Issue created.");
  };

  const deleteIssue = (issueId: string) => {
    commit((current) => ({
      ...current,
      issues: current.issues.filter((item) => item.id !== issueId),
      messages: current.messages.filter((item) => item.issueId !== issueId),
      updatedAt: now(),
    }));
    setSelectedIssueId("");
  };

  const createChannel = (event: FormEvent) => {
    event.preventDefault();
    const name = newChannelName.trim();
    if (!name) return;
    const next: Channel = {
      id: makeId("channel"),
      name,
      description: "New issue channel.",
      kind: "team",
      routing: { defaultAgentId: "organizer-agent", allowedAgentIds: workspace.agents.map((item) => item.id), adapter: "local" },
      createdAt: now(),
      updatedAt: now(),
    };
    commit((current) => ({ ...current, channels: [...current.channels, next], updatedAt: now() }));
    setNewChannelName("");
    setSelectedChannelId(next.id);
  };

  const deleteChannel = (channelId: string) => {
    const remaining = workspace.channels.filter((item) => item.id !== channelId);
    if (!remaining.length) return;
    const issueIds = workspace.issues.filter((item) => item.channelId === channelId).map((item) => item.id);
    commit((current) => ({
      ...current,
      channels: remaining,
      issues: current.issues.filter((item) => item.channelId !== channelId),
      messages: current.messages.filter((item) => !issueIds.includes(item.issueId)),
      updatedAt: now(),
    }));
    setSelectedChannelId(remaining[0].id);
    setSelectedIssueId("");
  };

  const updateChannel = (channelId: string, patch: Partial<Channel>) => {
    commit((current) => ({
      ...current,
      channels: current.channels.map((item) => (item.id === channelId ? { ...item, ...patch, updatedAt: now() } : item)),
      updatedAt: now(),
    }));
  };

  const runCommand = (body: string) => {
    const command = parseSlashCommand(body);
    if (!command || !channel) return false;
    if (command.type === "unknown") {
      if (issue) addSystemMessage(issue.id, command.reason);
      return true;
    }
    if (command.type === "new") {
      createIssue(command.title);
      return true;
    }
    if (command.type === "list") {
      if (issue) addSystemMessage(issue.id, issues.map((item) => `${item.status.toUpperCase()} - ${item.title}`).join("\n") || "No issues match the current filter.");
      return true;
    }
    if (!issue) return true;
    if (command.type === "status") updateIssue(issue.id, { status: command.status });
    if (command.type === "close") updateIssue(issue.id, { status: "done" });
    if (command.type === "tag" && !issue.tags.includes(command.tag)) updateIssue(issue.id, { tags: [...issue.tags, command.tag] });
    if (command.type === "assign") agent(command.agentId) ? updateIssue(issue.id, { assignedAgentId: command.agentId }) : addSystemMessage(issue.id, `Agent not found: ${command.agentId}`);
    if (command.type === "move") {
      const target = workspace.channels.find((item) => item.name.toLowerCase() === command.channelName.toLowerCase());
      target ? (updateIssue(issue.id, { channelId: target.id }), setSelectedChannelId(target.id)) : addSystemMessage(issue.id, `Channel not found: ${command.channelName}`);
    }
    if (command.type === "summary") addSystemMessage(issue.id, `Summary: ${issue.summary}\nStatus: ${issue.status}. Priority: ${issue.priority}. Tags: ${issue.tags.join(", ") || "none"}.`);
    return true;
  };

  const sendMessage = async (event: FormEvent) => {
    event.preventDefault();
    const body = composer.trim();
    if (!body || !issue) return;
    setComposer("");
    if (runCommand(body)) return;
    const userMessage: Message = { id: makeId("msg"), issueId: issue.id, kind: "user", authorName: "Keith", body, createdAt: now() };
    commit((current) => ({
      ...current,
      messages: [...current.messages, userMessage],
      issues: current.issues.map((item) => (item.id === issue.id ? { ...item, status: item.status === "open" ? "working" : item.status, updatedAt: now() } : item)),
      updatedAt: now(),
    }));
    const routedAgent = agent(issue.assignedAgentId) ?? agent(channel?.routing.defaultAgentId);
    if (!routedAgent) return;
    try {
      const reply = await requestAgentReply({ issue, agent: routedAgent, userMessage, recentMessages: messages.slice(-12) });
      commit((current) => ({ ...current, messages: [...current.messages, { ...reply, id: makeId("msg"), createdAt: now() }], updatedAt: now() }));
    } catch (error) {
      const body = error instanceof Error ? error.message : "Nono call failed.";
      commit((current) => ({
        ...current,
        messages: [...current.messages, { id: makeId("msg"), issueId: issue.id, kind: "system", authorName: "OpenClaw", body, createdAt: now() }],
        updatedAt: now(),
      }));
    }
  };

  return (
    <main className="app-shell">
      <aside className="pane channel-pane" aria-label="Channels">
        <div className="brand"><div><h1>Nono (OpenClaw)</h1><p>Issue Console</p></div><button type="button" aria-label="Reset workspace" onClick={() => setWorkspace(resetWorkspace())}>Reset</button></div>
        <div className={`sync-status ${syncStatus}`}>{syncStatus === "synced" ? "server synced" : syncStatus === "saving" ? "saving" : syncStatus === "loading" ? "loading" : syncStatus === "error" ? "sync error" : "local mode"}</div>
        <form className="channel-create" onSubmit={createChannel}><input value={newChannelName} onChange={(event) => setNewChannelName(event.target.value)} placeholder="new-channel" /><button type="submit">+</button></form>
        <nav className="channel-list">{workspace.channels.map((item) => <button key={item.id} className={item.id === channel?.id ? "channel active" : "channel"} onClick={() => { setSelectedChannelId(item.id); setSelectedIssueId(""); }}><span className="hash">#</span><span>{item.name}</span><small>{workspace.issues.filter((row) => row.channelId === item.id && row.status !== "archived").length}</small></button>)}</nav>
      </aside>
      <section className="pane center-pane" aria-label="Issues and messages">
        <header className="toolbar"><div><h2>#{channel?.name}</h2><p>{channel?.description}</p></div><button type="button" onClick={() => createIssue()}>New Issue</button></header>
        <div className="filters"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search issues" /><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as IssueStatus | "all")}><option value="all">All status</option>{ISSUE_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}</select></div>
        <div className="issue-and-thread"><div className="issue-list" aria-label="Issue list">{issues.map((item) => <button key={item.id} className={item.id === issue?.id ? "issue-row active" : "issue-row"} onClick={() => setSelectedIssueId(item.id)}><strong>{item.title}</strong><span>{item.summary}</span><footer><small className={`status ${item.status}`}>{item.status}</small><small>{item.priority}</small></footer></button>)}{!issues.length && <p className="empty">No issues match this view.</p>}</div>
          <div className="thread" aria-label="Issue conversation">{issue ? <><div className="thread-title"><h3>{issue.title}</h3><span className={`status ${issue.status}`}>{issue.status}</span></div><div className="messages">{messages.map((item) => <article className={`message ${item.kind}`} key={item.id}><header><strong>{item.authorName}</strong><span>{item.kind}</span><time>{formatTime(item.createdAt)}</time></header><p>{item.body}</p></article>)}</div><form className="composer" onSubmit={sendMessage}><input value={composer} onChange={(event) => setComposer(event.target.value)} placeholder="Message or /new, /list, /status, /assign, /close, /tag, /move, /summary" /><button type="submit">Send</button></form></> : <p className="empty">Create or select an issue to start a thread.</p>}</div></div>
      </section>
      <aside className="pane detail-pane" aria-label="Issue details">
        {channel && <section className="detail-section"><div className="section-title"><h2>Channel</h2>{workspace.channels.length > 1 && <button type="button" className="danger" onClick={() => deleteChannel(channel.id)}>Delete</button>}</div><label>Name<input value={channel.name} onChange={(event) => updateChannel(channel.id, { name: event.target.value })} /></label><label>Description<textarea value={channel.description} onChange={(event) => updateChannel(channel.id, { description: event.target.value })} /></label><label>Default agent<select value={channel.routing.defaultAgentId} onChange={(event) => updateChannel(channel.id, { routing: { ...channel.routing, defaultAgentId: event.target.value } })}>{workspace.agents.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></section>}
        {issue && <section className="detail-section"><div className="section-title"><h2>Issue</h2><button type="button" className="danger" onClick={() => deleteIssue(issue.id)}>Delete</button></div><label>Title<input value={issue.title} onChange={(event) => updateIssue(issue.id, { title: event.target.value })} /></label><label>Summary<textarea value={issue.summary} onChange={(event) => updateIssue(issue.id, { summary: event.target.value })} /></label><label>Status<select value={issue.status} onChange={(event) => updateIssue(issue.id, { status: event.target.value as IssueStatus })}>{ISSUE_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}</select></label><label>Priority<select value={issue.priority} onChange={(event) => updateIssue(issue.id, { priority: event.target.value as IssuePriority })}>{ISSUE_PRIORITIES.map((priority) => <option key={priority} value={priority}>{priority}</option>)}</select></label><label>Assigned agent<select value={issue.assignedAgentId ?? ""} onChange={(event) => updateIssue(issue.id, { assignedAgentId: event.target.value || undefined })}><option value="">Unassigned</option>{workspace.agents.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Move channel<select value={issue.channelId} onChange={(event) => updateIssue(issue.id, { channelId: event.target.value })}>{workspace.channels.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Tags<input value={issue.tags.join(", ")} onChange={(event) => updateIssue(issue.id, { tags: event.target.value.split(",").map((tag) => tag.trim().replace(/^#/, "")).filter(Boolean) })} /></label><div className="agent-roster">{workspace.agents.map((item) => <span key={item.id} className={item.status}>{item.id}</span>)}</div></section>}
      </aside>
    </main>
  );
}

export default App;
