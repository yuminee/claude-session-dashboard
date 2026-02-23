const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { WebSocketServer } = require('ws');

const { SERVER_PORT, PROCESS_POLL_INTERVAL_MS, STATUS, STUCK_STATUSES } = require('./lib/constants');
const { scanAllSessions, extractProjectName } = require('./lib/session-scanner');
const { analyzeSession } = require('./lib/session-analyzer');
const { getRunningSessionIds } = require('./lib/process-checker');
const { readAllTasks, findTaskGroupForSession } = require('./lib/task-reader');
const { createWatcher } = require('./lib/file-watcher');

// --- State ---
let currentData = { sessions: [], stats: {}, updatedAt: null };

// --- HTTP Server ---
const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
};

const server = http.createServer((req, res) => {
  // API endpoint for initial data
  if (req.url === '/api/sessions') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(currentData));
    return;
  }

  // API: Open iTerm2 with claude --resume
  if (req.url === '/api/open-iterm' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        const { sessionId, projectPath } = JSON.parse(body);
        if (!sessionId || !/^[0-9a-f-]+$/i.test(sessionId)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid sessionId' }));
          return;
        }

        const cdPart = projectPath ? `cd ${projectPath} && ` : '';
        const cmd = `unset CLAUDECODE && ${cdPart}claude --resume ${sessionId}`;

        // Write AppleScript to a temp file to avoid shell escaping issues
        const os = require('os');
        const scriptContent = [
          'tell application "iTerm"',
          '  activate',
          '  tell current window',
          '    create tab with default profile',
          '    tell current session',
          `      write text ${JSON.stringify(cmd)}`,
          '    end tell',
          '  end tell',
          'end tell',
        ].join('\n');

        const tmpFile = path.join(os.tmpdir(), `claude-dashboard-${Date.now()}.scpt`);
        fs.writeFileSync(tmpFile, scriptContent);

        exec(`osascript ${tmpFile}`, { timeout: 5000 }, (err) => {
          fs.unlink(tmpFile, () => {}); // cleanup
          if (err) {
            console.error('[open-iterm] Error:', err.message);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to open iTerm2' }));
            return;
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
        });
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid request body' }));
      }
    });
    return;
  }

  // Serve static files from public/
  let filePath = req.url === '/' ? '/index.html' : req.url;
  filePath = path.join(__dirname, 'public', filePath);

  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'text/plain';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

// --- WebSocket Server ---
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  // Send current state on connect
  ws.send(JSON.stringify({ type: 'full', data: currentData }));
});

function broadcast(data) {
  const payload = JSON.stringify(data);
  for (const client of wss.clients) {
    if (client.readyState === 1) { // OPEN
      client.send(payload);
    }
  }
}

// --- Core: Build dashboard data ---
function buildDashboardData() {
  const sessionsMap = scanAllSessions();
  const runningIds = getRunningSessionIds(sessionsMap);
  const taskGroups = readAllTasks();

  const sessions = [];
  const stats = { active: 0, stuck: 0, completed: 0, idle: 0, total: 0 };

  for (const [sessionId, session] of sessionsMap) {
    const analysis = analyzeSession(session, runningIds);
    const taskGroup = findTaskGroupForSession(sessionId, taskGroups);

    const projectName = extractProjectName(session);

    const entry = {
      sessionId,
      projectName,
      projectPath: session.projectPath,
      gitBranch: session.gitBranch,
      summary: session.summary,
      firstPrompt: session.firstPrompt,
      messageCount: session.messageCount,
      created: session.created,
      modified: session.modified,
      status: analysis.status,
      lastMessage: analysis.lastMessage,
      lastTimestamp: analysis.lastTimestamp,
      detail: analysis.detail,
      tasks: taskGroup ? taskGroup : null,
    };

    sessions.push(entry);

    // Count stats
    stats.total++;
    if (analysis.status === STATUS.ACTIVE) stats.active++;
    else if (STUCK_STATUSES.has(analysis.status)) stats.stuck++;
    else if (analysis.status === STATUS.COMPLETED) stats.completed++;
    else stats.idle++;
  }

  // Sort: stuck first, then active, then completed, then idle. Within each group, newest first.
  const statusOrder = {
    [STATUS.STUCK_PERMISSION]: 0,
    [STATUS.STUCK_ERROR]: 0,
    [STATUS.STUCK_TIMEOUT]: 0,
    [STATUS.ACTIVE]: 1,
    [STATUS.COMPLETED]: 2,
    [STATUS.IDLE]: 3,
  };

  sessions.sort((a, b) => {
    const orderDiff = (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9);
    if (orderDiff !== 0) return orderDiff;
    // Within same status group, newest first
    const timeA = a.lastTimestamp || 0;
    const timeB = b.lastTimestamp || 0;
    return timeB - timeA;
  });

  return { sessions, stats, updatedAt: Date.now() };
}

// --- Refresh & Broadcast ---
function refresh() {
  try {
    currentData = buildDashboardData();
    broadcast({ type: 'full', data: currentData });
  } catch (err) {
    console.error('[refresh] Error:', err.message);
  }
}

// --- Start ---
function start() {
  console.log('[dashboard] Building initial data...');
  currentData = buildDashboardData();
  console.log(`[dashboard] Found ${currentData.stats.total} sessions (${currentData.stats.active} active, ${currentData.stats.stuck} stuck)`);

  // File watcher
  console.log('[dashboard] Starting file watcher...');
  createWatcher(() => {
    refresh();
  });

  // Process polling
  console.log(`[dashboard] Starting process polling (${PROCESS_POLL_INTERVAL_MS / 1000}s interval)...`);
  setInterval(() => {
    refresh();
  }, PROCESS_POLL_INTERVAL_MS);

  // Start HTTP server
  server.listen(SERVER_PORT, () => {
    console.log(`\n[dashboard] ✦ Claude Session Dashboard running at http://localhost:${SERVER_PORT}\n`);
  });
}

start();
