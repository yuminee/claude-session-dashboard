# Claude Session Dashboard

Real-time web dashboard for monitoring multiple Claude Code sessions — detect stuck permissions, errors, and timeouts at a glance.

## Features

- **Real-time monitoring**: WebSocket + file watching (chokidar) for instant status updates
- **Automatic status detection**: Analyzes JSONL messages to classify sessions into 6 states
- **Process matching**: Uses `lsof` to map Claude process working directories to sessions
- **Task progress tracking**: Displays per-session task lists (pending / in_progress / completed)
- **Session resume**: Copy resume command to clipboard or open directly in iTerm2
- **Terminal-themed UI**: Dark background, scanline effect, green/amber text, CRT glow

## Status Types

| Status | Badge | Condition |
|--------|-------|-----------|
| **Active** | `● RUN` | Claude process is running and working normally |
| **Permission Wait** | `▲ PERM` | Last assistant message is `tool_use` with no `tool_result` — waiting for user permission |
| **Error** | `▲ ERR` | Last `tool_result` has `is_error: true` while process is running |
| **Timeout** | `▲ TMOUT` | Process is running but JSONL has not been modified for > 3 minutes |
| **Completed** | `✓ DONE` | No process + last message is an assistant text response (no pending tool_use) |
| **Idle** | `○ IDLE` | None of the above conditions apply (inactive / old session) |

## Requirements

- **Node.js** v18+
- **macOS** (process detection uses `lsof`)
- **Claude Code** installed with session data in `~/.claude/`

## Quick Start

```bash
git clone git@github.com:yuminee/claude-session-dashboard.git
cd claude-session-dashboard
npm install
npm start
```

Open http://localhost:3456 in your browser.

## Data Sources

| Source | Path | Purpose |
|--------|------|---------|
| Session Index | `~/.claude/projects/*/sessions-index.json` | Session list, summaries, timestamps |
| Session JSONL | `~/.claude/projects/*/*.jsonl` | Last message analysis for status detection |
| Tasks | `~/.claude/tasks/*/` | Task progress tracking |
| Processes | `ps` + `lsof -d cwd` | Running session detection |

## Architecture

```
server.js              HTTP + WebSocket + file watching + process polling
├── lib/
│   ├── constants.js           Paths, thresholds, status enums
│   ├── session-scanner.js     Scan sessions-index.json + JSONL files
│   ├── session-analyzer.js    JSONL tail analysis + status classification
│   ├── process-checker.js     Map Claude PIDs to projects via lsof
│   ├── task-reader.js         Read task JSON files
│   └── file-watcher.js        chokidar wrapper + debounce
└── public/
    ├── index.html             Dashboard + Status Legend panel
    ├── style.css              Terminal dark theme + CRT effects
    └── app.js                 WebSocket client + accordion UI
```

## How It Works

1. **Session scan**: Reads `sessions-index.json` files under `~/.claude/projects/` and discovers unindexed JSONL files to build the full session list
2. **JSONL analysis**: Reads the last 16KB of each session's JSONL file and inspects `tool_use` / `tool_result` / `is_error` patterns to determine status
3. **Process detection**: Finds Claude process PIDs via `ps`, then resolves their working directories with `lsof -d cwd` to match against session project paths
4. **Real-time updates**: chokidar watches for file changes (500ms debounce) + 5-second process polling interval
5. **WebSocket push**: On any change, broadcasts the updated state to all connected browsers

## Configuration

Adjustable in `lib/constants.js`:

| Setting | Default | Description |
|---------|---------|-------------|
| `SERVER_PORT` | `3456` | Dashboard server port |
| `ACTIVE_TIMEOUT_MS` | `180000` (3 min) | No messages for this long → timeout status |
| `PROCESS_POLL_INTERVAL_MS` | `5000` (5 sec) | Process status check interval |
| `DEBOUNCE_MS` | `500` | File change debounce delay |
| `JSONL_TAIL_BYTES` | `16384` (16KB) | Bytes to read from end of JSONL files |

## License

MIT
