const chokidar = require('chokidar');
const { PROJECTS_DIR, TASKS_DIR, DEBOUNCE_MS } = require('./constants');

/**
 * Watch Claude project files and tasks for changes.
 * Calls onChange callback with debouncing.
 */
function createWatcher(onChange) {
  let debounceTimer = null;

  const debouncedOnChange = (eventPath) => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      onChange(eventPath);
    }, DEBOUNCE_MS);
  };

  const watcher = chokidar.watch(
    [
      `${PROJECTS_DIR}/*/sessions-index.json`,
      `${PROJECTS_DIR}/*/*.jsonl`,
      `${TASKS_DIR}/*/*.json`,
    ],
    {
      ignoreInitial: true,
      persistent: true,
      awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 100,
      },
      // Don't follow symlinks to avoid loops
      followSymlinks: false,
      // Ignore dot files except .json
      ignored: /(^|[\/\\])\..(?!json)/,
    }
  );

  watcher.on('change', debouncedOnChange);
  watcher.on('add', debouncedOnChange);
  watcher.on('unlink', debouncedOnChange);

  watcher.on('error', (err) => {
    console.error('[watcher] Error:', err.message);
  });

  return watcher;
}

module.exports = { createWatcher };
