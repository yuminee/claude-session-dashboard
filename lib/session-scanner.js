const fs = require('fs');
const path = require('path');
const { PROJECTS_DIR } = require('./constants');

/**
 * Scan all sessions-index.json files under ~/.claude/projects/
 * Also discovers JSONL files not yet indexed (e.g. currently active sessions).
 * Returns a Map of sessionId -> session entry
 */
function scanAllSessions() {
  const sessions = new Map();

  let projectDirs;
  try {
    projectDirs = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true });
  } catch {
    return sessions;
  }

  for (const dirent of projectDirs) {
    if (!dirent.isDirectory()) continue;

    const dirPath = path.join(PROJECTS_DIR, dirent.name);
    const projectSlug = dirent.name;

    // 1. Read sessions-index.json
    const indexPath = path.join(dirPath, 'sessions-index.json');
    try {
      const raw = fs.readFileSync(indexPath, 'utf-8');
      const data = JSON.parse(raw);
      if (data.entries && Array.isArray(data.entries)) {
        for (const entry of data.entries) {
          if (!entry.sessionId) continue;
          sessions.set(entry.sessionId, {
            sessionId: entry.sessionId,
            fullPath: entry.fullPath,
            firstPrompt: entry.firstPrompt || '',
            summary: entry.summary || '',
            messageCount: entry.messageCount || 0,
            created: entry.created,
            modified: entry.modified,
            gitBranch: entry.gitBranch || '',
            projectPath: entry.projectPath || '',
            projectSlug,
            isSidechain: entry.isSidechain || false,
          });
        }
      }
    } catch {
      // No index file or invalid — continue to scan JSONL files
    }

    // 2. Discover JSONL files not in the index (recently created sessions)
    try {
      const files = fs.readdirSync(dirPath);
      for (const file of files) {
        if (!file.endsWith('.jsonl')) continue;
        const sessionId = file.replace('.jsonl', '');
        if (sessions.has(sessionId)) continue; // Already indexed

        const fullPath = path.join(dirPath, file);
        let stat;
        try {
          stat = fs.statSync(fullPath);
        } catch { continue; }

        // Read first line to extract metadata
        const meta = readFirstMessage(fullPath);

        sessions.set(sessionId, {
          sessionId,
          fullPath,
          firstPrompt: meta.firstPrompt || '',
          summary: '',
          messageCount: 0,
          created: stat.birthtime ? stat.birthtime.toISOString() : null,
          modified: stat.mtime ? stat.mtime.toISOString() : null,
          gitBranch: meta.gitBranch || '',
          projectPath: meta.cwd || decodeProjectSlug(projectSlug),
          projectSlug,
          isSidechain: false,
        });
      }
    } catch {
      // Can't list dir
    }
  }

  return sessions;
}

/**
 * Read the first few messages from a JSONL to extract metadata.
 */
function readFirstMessage(filePath) {
  const result = { firstPrompt: '', gitBranch: '', cwd: '' };
  try {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(4096);
    const bytesRead = fs.readSync(fd, buf, 0, 4096, 0);
    fs.closeSync(fd);

    const text = buf.toString('utf-8', 0, bytesRead);
    const lines = text.split('\n');

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const obj = JSON.parse(line);
        if (obj.gitBranch && !result.gitBranch) result.gitBranch = obj.gitBranch;
        if (obj.cwd && !result.cwd) result.cwd = obj.cwd;
        if (obj.message?.role === 'user' && !result.firstPrompt) {
          const content = obj.message.content;
          if (typeof content === 'string') {
            result.firstPrompt = content.slice(0, 200);
          } else if (Array.isArray(content)) {
            const textBlock = content.find((b) => b.type === 'text');
            if (textBlock) result.firstPrompt = textBlock.text.slice(0, 200);
          }
        }
        // Stop after finding what we need
        if (result.gitBranch && result.cwd && result.firstPrompt) break;
      } catch { /* skip malformed lines */ }
    }
  } catch { /* file read error */ }

  return result;
}

/**
 * Decode a project slug back to a path.
 * e.g., -Users-john-projects-my-app → /Users/john/projects/my-app
 */
function decodeProjectSlug(slug) {
  // Slug is the path with / replaced by -
  // Best effort: replace leading - and split
  return slug.replace(/^-/, '/').replace(/-/g, '/');
}

/**
 * Extract a human-readable project name from projectPath or projectSlug
 */
function extractProjectName(session) {
  if (session.projectPath) {
    return path.basename(session.projectPath);
  }
  // Fallback: decode slug
  const parts = session.projectSlug.split('-').filter(Boolean);
  return parts[parts.length - 1] || session.projectSlug;
}

module.exports = { scanAllSessions, extractProjectName };
