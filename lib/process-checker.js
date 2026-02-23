const fs = require('fs');
const { execSync } = require('child_process');
const { DEMO_MODE } = require('./constants');

/**
 * Get a Set of CWDs for running Claude CLI processes.
 * Uses `lsof` on macOS to determine each process's working directory.
 */
function getRunningClaudeCwds() {
  const cwds = new Set();

  try {
    const output = execSync(
      'ps -eo pid,comm 2>/dev/null | grep -i "[c]laude" || true',
      { encoding: 'utf-8', timeout: 5000 }
    );

    const pids = [];
    for (const line of output.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const parts = trimmed.split(/\s+/);
      const pid = parts[0];
      const comm = parts.slice(1).join(' ');
      if (comm === 'claude' || comm.endsWith('/claude')) {
        pids.push(pid);
      }
    }

    if (pids.length === 0) return cwds;

    try {
      const pidList = pids.join(',');
      const lsofOutput = execSync(
        `lsof -a -d cwd -p ${pidList} -Fpn 2>/dev/null || true`,
        { encoding: 'utf-8', timeout: 5000 }
      );

      for (const line of lsofOutput.split('\n')) {
        if (line.startsWith('n') && line.length > 1) {
          const cwd = line.slice(1);
          if (cwd.startsWith('/')) {
            cwds.add(cwd);
          }
        }
      }
    } catch { /* ignore lsof errors */ }
  } catch {
    // ps command failed
  }

  return cwds;
}

/**
 * Determine which session IDs have a running Claude process.
 *
 * Strategy:
 * 1. Get CWDs of running Claude processes
 * 2. For each CWD, find the session with matching projectPath whose JSONL was modified most recently
 * 3. Also check for recently modified JSONL files (< 30s) as a fallback signal
 */
function getRunningSessionIds(sessionsMap) {
  const running = new Set();
  if (!sessionsMap || sessionsMap.size === 0) return running;

  // Demo mode: mark sessions with recently modified JSONL as running
  if (DEMO_MODE) {
    const now = Date.now();
    for (const [sessionId, session] of sessionsMap) {
      if (!session.fullPath) continue;
      try {
        const stat = fs.statSync(session.fullPath);
        if (now - stat.mtimeMs < 10 * 60 * 1000) { // 10 min
          running.add(sessionId);
        }
      } catch { /* ignore */ }
    }
    return running;
  }

  const cwds = getRunningClaudeCwds();
  const now = Date.now();

  // Build a reverse index: projectPath → [sessions sorted by JSONL mtime desc]
  const byProjectPath = new Map();
  for (const [sessionId, session] of sessionsMap) {
    if (!session.projectPath) continue;

    let mtime = 0;
    if (session.fullPath) {
      try {
        const stat = fs.statSync(session.fullPath);
        mtime = stat.mtimeMs;
      } catch { /* use 0 */ }
    }

    const key = session.projectPath;
    if (!byProjectPath.has(key)) {
      byProjectPath.set(key, []);
    }
    byProjectPath.get(key).push({ sessionId, mtime });
  }

  // Sort each group by mtime descending
  for (const [, arr] of byProjectPath) {
    arr.sort((a, b) => b.mtime - a.mtime);
  }

  // Match CWDs to sessions
  for (const cwd of cwds) {
    // Direct match
    if (byProjectPath.has(cwd)) {
      const best = byProjectPath.get(cwd)[0];
      if (best) running.add(best.sessionId);
      continue;
    }

    // Subdirectory match: CWD might be a subdirectory of projectPath, or vice versa
    for (const [projectPath, sessions] of byProjectPath) {
      if (cwd.startsWith(projectPath + '/') || projectPath.startsWith(cwd + '/') || cwd === projectPath) {
        if (sessions[0]) running.add(sessions[0].sessionId);
        break;
      }
    }
  }

  // Fallback: any JSONL modified in the last 30 seconds is likely from an active session
  for (const [sessionId, session] of sessionsMap) {
    if (running.has(sessionId)) continue;
    if (!session.fullPath) continue;
    try {
      const stat = fs.statSync(session.fullPath);
      if (now - stat.mtimeMs < 30000) {
        running.add(sessionId);
      }
    } catch { /* ignore */ }
  }

  return running;
}

module.exports = { getRunningSessionIds, getRunningClaudeCwds };
