# Nono Discord

Discord-like issue console for OpenClaw work routing.

This is the current MVP: a standalone React app that models Discord-style channels and threaded issues without depending on the Discord API. The data layer is intentionally adapter-ready so Discord, CLI, Teams, OpenClaw Agent API, or Cron integrations can be added later.

## Features

- Three-pane workspace UI: channels, issue thread, issue details
- Core models: `Workspace`, `Channel`, `Issue`, `Message`, `Agent`, `Routing`
- Channel and issue create/edit/delete flows
- Status, priority, tags, assigned agent, and channel movement controls
- Message history per issue
- Mock agent replies behind `agentService`
- Namespaced `localStorage` persistence via `storageService`
- Keyword search and status filtering
- Slash commands:
  - `/new <title>`
  - `/list`
  - `/status <status>`
  - `/assign <agentId>`
  - `/close`
  - `/tag <tag>`
  - `/move <channelName>`
  - `/summary`

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

## Architecture

- `src/models.ts` defines the adapter-neutral data model.
- `src/services/storageService.ts` owns seed data and browser persistence.
- `src/services/agentService.ts` isolates agent calls; the MVP returns mock replies.
- `src/services/commandParser.ts` parses slash commands independently of the UI.
- `src/App.tsx` wires state transitions and the current browser UI.

The app currently stores everything in browser `localStorage` under `openclaw.issueConsole.workspace.v1`. It does not read or write MemEdit data.

## Next Phase

- Add HTTP deployment behind the same auth pattern as MemEdit.
- Replace mock `agentService` with OpenClaw Agent API calls.
- Add real Cron/OpenClaw issue import and update adapters.
- Add Discord adapter after the local model is stable.
