const os = require('os');
const path = require('path');

const CLAUDE_DIR = process.env.CLAUDE_DIR || path.join(os.homedir(), '.claude');
const PROJECTS_DIR = path.join(CLAUDE_DIR, 'projects');
const TASKS_DIR = path.join(CLAUDE_DIR, 'tasks');
const DEMO_MODE = process.env.DEMO_MODE === '1';

const STATUS = {
  ACTIVE: 'active',
  STUCK_PERMISSION: 'stuck_permission',
  STUCK_ERROR: 'stuck_error',
  STUCK_TIMEOUT: 'stuck_timeout',
  COMPLETED: 'completed',
  IDLE: 'idle',
};

const STUCK_STATUSES = new Set([STATUS.STUCK_PERMISSION, STATUS.STUCK_ERROR, STATUS.STUCK_TIMEOUT]);

// Thresholds
const ACTIVE_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes
const JSONL_TAIL_BYTES = 16 * 1024; // 16KB tail read
const PROCESS_POLL_INTERVAL_MS = 5000;
const DEBOUNCE_MS = 500;
const SERVER_PORT = 3456;

module.exports = {
  CLAUDE_DIR,
  PROJECTS_DIR,
  TASKS_DIR,
  STATUS,
  STUCK_STATUSES,
  ACTIVE_TIMEOUT_MS,
  JSONL_TAIL_BYTES,
  PROCESS_POLL_INTERVAL_MS,
  DEBOUNCE_MS,
  SERVER_PORT,
  DEMO_MODE,
};
