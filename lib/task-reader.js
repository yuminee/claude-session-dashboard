const fs = require('fs');
const path = require('path');
const { TASKS_DIR } = require('./constants');

/**
 * Read all task groups from ~/.claude/tasks/
 * Returns a Map of taskGroupId -> { tasks: [...], stats }
 */
function readAllTasks() {
  const taskGroups = new Map();

  let dirs;
  try {
    dirs = fs.readdirSync(TASKS_DIR, { withFileTypes: true });
  } catch {
    return taskGroups;
  }

  for (const dirent of dirs) {
    if (!dirent.isDirectory()) continue;

    const groupId = dirent.name;
    const groupDir = path.join(TASKS_DIR, groupId);
    const tasks = [];

    let files;
    try {
      files = fs.readdirSync(groupDir);
    } catch {
      continue;
    }

    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const raw = fs.readFileSync(path.join(groupDir, file), 'utf-8');
        const task = JSON.parse(raw);
        tasks.push(task);
      } catch {
        // skip invalid task files
      }
    }

    if (tasks.length === 0) continue;

    // Sort tasks by ID (numeric)
    tasks.sort((a, b) => {
      const idA = parseInt(a.id, 10) || 0;
      const idB = parseInt(b.id, 10) || 0;
      return idA - idB;
    });

    const stats = {
      total: tasks.length,
      pending: tasks.filter((t) => t.status === 'pending').length,
      in_progress: tasks.filter((t) => t.status === 'in_progress').length,
      completed: tasks.filter((t) => t.status === 'completed').length,
    };

    taskGroups.set(groupId, { tasks, stats });
  }

  return taskGroups;
}

/**
 * Try to associate a task group with a session by matching
 * the task group ID from recently modified JSONL.
 * Returns null if no match.
 */
function findTaskGroupForSession(sessionId, taskGroups) {
  // Task group IDs are session IDs in ~/.claude/tasks/
  if (taskGroups.has(sessionId)) {
    return taskGroups.get(sessionId);
  }
  return null;
}

module.exports = { readAllTasks, findTaskGroupForSession };
