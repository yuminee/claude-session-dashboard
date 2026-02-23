const fs = require('fs');
const { STATUS, ACTIVE_TIMEOUT_MS, JSONL_TAIL_BYTES } = require('./constants');

/**
 * Read the tail of a JSONL file and parse the last N messages.
 * Returns an array of parsed message objects (newest last).
 */
function readJsonlTail(filePath) {
  const messages = [];

  try {
    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    if (fileSize === 0) return messages;

    const readSize = Math.min(fileSize, JSONL_TAIL_BYTES);
    const startPos = fileSize - readSize;

    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(readSize);
    fs.readSync(fd, buffer, 0, readSize, startPos);
    fs.closeSync(fd);

    const text = buffer.toString('utf-8');
    const lines = text.split('\n');

    // Skip first line if we started mid-file (likely partial)
    const startIdx = startPos > 0 ? 1 : 0;

    for (let i = startIdx; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      try {
        messages.push(JSON.parse(line));
      } catch {
        // skip malformed lines
      }
    }
  } catch {
    // file read error
  }

  return messages;
}

/**
 * Analyze session status based on JSONL tail and process state.
 *
 * Returns: { status, lastMessage, lastTimestamp, detail }
 */
function analyzeSession(session, runningSessionIds) {
  const isRunning = runningSessionIds.has(session.sessionId);
  const filePath = session.fullPath;

  if (!filePath || !fs.existsSync(filePath)) {
    return {
      status: STATUS.IDLE,
      lastMessage: null,
      lastTimestamp: null,
      detail: null,
    };
  }

  const messages = readJsonlTail(filePath);
  if (messages.length === 0) {
    return {
      status: isRunning ? STATUS.ACTIVE : STATUS.IDLE,
      lastMessage: null,
      lastTimestamp: session.modified || null,
      detail: null,
    };
  }

  // Find actual conversation messages (not progress/system entries)
  const conversationMsgs = messages.filter(
    (m) => m.message && (m.message.role === 'assistant' || m.message.role === 'user')
  );

  // Get the file's mtime as latest activity indicator
  let lastTimestamp;
  try {
    const stat = fs.statSync(filePath);
    lastTimestamp = stat.mtimeMs;
  } catch {
    lastTimestamp = session.modified ? new Date(session.modified).getTime() : null;
  }

  const now = Date.now();
  const age = lastTimestamp ? now - lastTimestamp : Infinity;

  // Find the last assistant and user messages
  const lastAssistant = findLast(conversationMsgs, (m) => m.message.role === 'assistant');
  const lastUser = findLast(conversationMsgs, (m) => m.message.role === 'user');

  // Determine the very last conversation message
  const lastMsg = conversationMsgs.length > 0 ? conversationMsgs[conversationMsgs.length - 1] : null;

  // Extract detail info
  const detail = extractDetail(lastMsg, lastAssistant, lastUser, messages);

  // --- Status determination ---

  // Check for stuck_permission: last assistant has tool_use, no tool_result after
  if (lastAssistant && hasToolUse(lastAssistant)) {
    const lastToolResult = findLastToolResult(conversationMsgs, lastAssistant);
    if (!lastToolResult) {
      // Assistant requested a tool, but no result came back
      if (isRunning || age < ACTIVE_TIMEOUT_MS) {
        return {
          status: STATUS.STUCK_PERMISSION,
          lastMessage: summarizeMessage(lastAssistant),
          lastTimestamp,
          detail,
        };
      }
    }
  }

  // Check for stuck_error: last tool_result has is_error: true
  if (lastUser && hasErrorToolResult(lastUser)) {
    if (isRunning) {
      return {
        status: STATUS.STUCK_ERROR,
        lastMessage: summarizeMessage(lastUser),
        lastTimestamp,
        detail,
      };
    }
  }

  // Check for stuck_timeout: process running but no recent messages
  if (isRunning && age > ACTIVE_TIMEOUT_MS) {
    return {
      status: STATUS.STUCK_TIMEOUT,
      lastMessage: summarizeMessage(lastMsg),
      lastTimestamp,
      detail,
    };
  }

  // Active: process running and recent activity
  if (isRunning) {
    return {
      status: STATUS.ACTIVE,
      lastMessage: summarizeMessage(lastMsg),
      lastTimestamp,
      detail,
    };
  }

  // Completed: not running, last message is assistant response (no pending tool_use)
  if (lastMsg && lastMsg.message.role === 'assistant' && !hasToolUse(lastMsg)) {
    return {
      status: STATUS.COMPLETED,
      lastMessage: summarizeMessage(lastMsg),
      lastTimestamp,
      detail,
    };
  }

  // Default: idle
  return {
    status: STATUS.IDLE,
    lastMessage: summarizeMessage(lastMsg),
    lastTimestamp,
    detail,
  };
}

// --- Helper functions ---

function findLast(arr, predicate) {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (predicate(arr[i])) return arr[i];
  }
  return null;
}

function hasToolUse(entry) {
  const content = entry.message?.content;
  if (!Array.isArray(content)) return false;
  return content.some((block) => block.type === 'tool_use');
}

function hasErrorToolResult(entry) {
  const content = entry.message?.content;
  if (!Array.isArray(content)) return false;
  return content.some((block) => block.type === 'tool_result' && block.is_error);
}

function findLastToolResult(conversationMsgs, assistantEntry) {
  const assistantIdx = conversationMsgs.indexOf(assistantEntry);
  if (assistantIdx < 0) return null;

  for (let i = assistantIdx + 1; i < conversationMsgs.length; i++) {
    const msg = conversationMsgs[i];
    if (msg.message.role === 'user') {
      const content = msg.message.content;
      if (Array.isArray(content) && content.some((b) => b.type === 'tool_result')) {
        return msg;
      }
    }
  }
  return null;
}

function summarizeMessage(entry) {
  if (!entry || !entry.message) return null;
  const content = entry.message.content;

  if (typeof content === 'string') {
    return content.slice(0, 200);
  }

  if (Array.isArray(content)) {
    // Find text blocks
    const textBlocks = content.filter((b) => b.type === 'text');
    if (textBlocks.length > 0) {
      return textBlocks.map((b) => b.text).join(' ').slice(0, 200);
    }

    // Summarize tool_use blocks
    const toolUses = content.filter((b) => b.type === 'tool_use');
    if (toolUses.length > 0) {
      return `[Tool: ${toolUses.map((t) => t.name).join(', ')}]`;
    }

    // Summarize tool_result blocks
    const toolResults = content.filter((b) => b.type === 'tool_result');
    if (toolResults.length > 0) {
      const hasError = toolResults.some((r) => r.is_error);
      return hasError ? '[Tool result: ERROR]' : '[Tool result: OK]';
    }
  }

  return null;
}

function extractDetail(lastMsg, lastAssistant, lastUser, allMessages) {
  const detail = {};

  // Extract waiting tool info if permission stuck
  if (lastAssistant && hasToolUse(lastAssistant)) {
    const toolUses = lastAssistant.message.content.filter((b) => b.type === 'tool_use');
    if (toolUses.length > 0) {
      const tool = toolUses[toolUses.length - 1];
      detail.waitingTool = tool.name;
      // Try to extract a meaningful input summary
      if (tool.input) {
        if (tool.input.command) {
          detail.waitingToolInput = tool.input.command.slice(0, 150);
        } else if (tool.input.file_path) {
          detail.waitingToolInput = tool.input.file_path;
        } else if (tool.input.pattern) {
          detail.waitingToolInput = tool.input.pattern;
        }
      }
    }
  }

  // Extract last error if any
  if (lastUser && hasErrorToolResult(lastUser)) {
    const errResults = lastUser.message.content.filter(
      (b) => b.type === 'tool_result' && b.is_error
    );
    if (errResults.length > 0) {
      const errContent = errResults[0].content;
      if (typeof errContent === 'string') {
        detail.errorMessage = errContent.slice(0, 200);
      } else if (Array.isArray(errContent)) {
        const textParts = errContent.filter((c) => c.type === 'text');
        if (textParts.length > 0) {
          detail.errorMessage = textParts.map((t) => t.text).join(' ').slice(0, 200);
        }
      }
    }
  }

  return Object.keys(detail).length > 0 ? detail : null;
}

module.exports = { analyzeSession, readJsonlTail };
