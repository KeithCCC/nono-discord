import type { IssueStatus } from "../models";

export type SlashCommand =
  | { type: "new"; title: string }
  | { type: "list" }
  | { type: "status"; status: IssueStatus }
  | { type: "assign"; agentId: string }
  | { type: "close" }
  | { type: "tag"; tag: string }
  | { type: "move"; channelName: string }
  | { type: "summary" }
  | { type: "unknown"; reason: string };

const statuses: IssueStatus[] = ["open", "working", "waiting", "blocked", "done", "archived"];

export function parseSlashCommand(input: string): SlashCommand | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) return null;

  const [command, ...rest] = trimmed.slice(1).split(/\s+/);
  const arg = rest.join(" ").trim();

  switch (command.toLowerCase()) {
    case "new":
      return arg ? { type: "new", title: arg } : { type: "unknown", reason: "Usage: /new <title>" };
    case "list":
      return { type: "list" };
    case "status":
      return statuses.includes(arg as IssueStatus)
        ? { type: "status", status: arg as IssueStatus }
        : { type: "unknown", reason: "Usage: /status open|working|waiting|blocked|done|archived" };
    case "assign":
      return arg ? { type: "assign", agentId: arg } : { type: "unknown", reason: "Usage: /assign <agentId>" };
    case "close":
      return { type: "close" };
    case "tag":
      return arg ? { type: "tag", tag: arg.replace(/^#/, "") } : { type: "unknown", reason: "Usage: /tag <tag>" };
    case "move":
      return arg ? { type: "move", channelName: arg } : { type: "unknown", reason: "Usage: /move <channelName>" };
    case "summary":
      return { type: "summary" };
    default:
      return { type: "unknown", reason: `Unknown command: /${command}` };
  }
}
