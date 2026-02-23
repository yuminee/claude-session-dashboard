/* === Claude Session Dashboard — Frontend === */

const STATUS_CONFIG = {
  active: { icon: '●', label: 'RUN', class: 'badge-active' },
  stuck_permission: { icon: '▲', label: 'PERM', class: 'badge-stuck_permission' },
  stuck_error: { icon: '▲', label: 'ERR', class: 'badge-stuck_error' },
  stuck_timeout: { icon: '▲', label: 'TMOUT', class: 'badge-stuck_timeout' },
  completed: { icon: '✓', label: 'DONE', class: 'badge-completed' },
  idle: { icon: '○', label: 'IDLE', class: 'badge-idle' },
};

let sessions = [];
let expandedSessionId = null;
let ws = null;
let reconnectTimer = null;

// --- DOM refs ---
const $sessionList = document.getElementById('sessionList');
const $connectionStatus = document.getElementById('connectionStatus');
const $filterInput = document.getElementById('filterInput');
const $statusFilter = document.getElementById('statusFilter');
const $statActive = document.getElementById('statActive');
const $statStuck = document.getElementById('statStuck');
const $statCompleted = document.getElementById('statCompleted');
const $statIdle = document.getElementById('statIdle');
const $updateTime = document.getElementById('updateTime');
const $sessionCount = document.getElementById('sessionCount');
const $helpToggle = document.getElementById('helpToggle');
const $legendPanel = document.getElementById('legendPanel');
const $legendClose = document.getElementById('legendClose');

// --- Legend Toggle ---
$helpToggle.addEventListener('click', () => {
  const visible = $legendPanel.style.display !== 'none';
  $legendPanel.style.display = visible ? 'none' : 'block';
  $helpToggle.classList.toggle('active', !visible);
});

$legendClose.addEventListener('click', () => {
  $legendPanel.style.display = 'none';
  $helpToggle.classList.remove('active');
});

// --- WebSocket ---
function connect() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${location.host}`);

  ws.onopen = () => {
    setConnectionStatus(true);
    if (reconnectTimer) {
      clearInterval(reconnectTimer);
      reconnectTimer = null;
    }
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === 'full') {
        handleUpdate(msg.data);
      }
    } catch { /* ignore parse errors */ }
  };

  ws.onclose = () => {
    setConnectionStatus(false);
    if (!reconnectTimer) {
      reconnectTimer = setInterval(() => connect(), 3000);
    }
  };

  ws.onerror = () => {
    ws.close();
  };
}

function setConnectionStatus(connected) {
  const dot = $connectionStatus.querySelector('.status-dot');
  if (connected) {
    dot.className = 'status-dot connected';
    $connectionStatus.innerHTML = '';
    $connectionStatus.appendChild(dot);
    $connectionStatus.append(' CONNECTED');
  } else {
    dot.className = 'status-dot disconnected';
    $connectionStatus.innerHTML = '';
    $connectionStatus.appendChild(dot);
    $connectionStatus.append(' DISCONNECTED');
  }
}

// --- Data Update ---
function handleUpdate(data) {
  sessions = data.sessions || [];
  updateStats(data.stats || {});
  updateFooter(data);
  renderSessions();
}

function updateStats(stats) {
  $statActive.textContent = `■ ${stats.active || 0} ACTIVE`;
  $statStuck.textContent = `▲ ${stats.stuck || 0} STUCK`;
  $statCompleted.textContent = `✓ ${stats.completed || 0} DONE`;
  $statIdle.textContent = `○ ${stats.idle || 0} IDLE`;
}

function updateFooter(data) {
  if (data.updatedAt) {
    const d = new Date(data.updatedAt);
    $updateTime.textContent = `Last update: ${d.toLocaleTimeString()}`;
  }
  $sessionCount.textContent = `${sessions.length} sessions`;
}

// --- Filtering ---
function getFilteredSessions() {
  const query = $filterInput.value.toLowerCase().trim();
  const statusF = $statusFilter.value;

  return sessions.filter((s) => {
    if (statusF === 'active' && s.status !== 'active') return false;
    if (statusF === 'stuck' && !s.status.startsWith('stuck_')) return false;
    if (statusF === 'completed' && s.status !== 'completed') return false;
    if (statusF === 'idle' && s.status !== 'idle') return false;

    if (query) {
      const haystack = [
        s.projectName,
        s.gitBranch,
        s.summary,
        s.firstPrompt,
        s.sessionId,
      ].join(' ').toLowerCase();
      return haystack.includes(query);
    }

    return true;
  });
}

// --- Rendering ---
function renderSessions() {
  const filtered = getFilteredSessions();

  if (filtered.length === 0) {
    $sessionList.innerHTML = sessions.length === 0
      ? '<div class="empty-state">No sessions found. Start a Claude Code session to see it here.</div>'
      : '<div class="empty-state">No sessions match the current filter.</div>';
    return;
  }

  const fragment = document.createDocumentFragment();

  for (const session of filtered) {
    const isExpanded = session.sessionId === expandedSessionId;

    // --- Row ---
    const row = document.createElement('div');
    row.className = 'session-row';
    if (session.status.startsWith('stuck_')) row.className += ' stuck';
    if (isExpanded) row.className += ' selected';
    row.dataset.sessionId = session.sessionId;

    const cfg = STATUS_CONFIG[session.status] || STATUS_CONFIG.idle;
    const age = formatAge(session.lastTimestamp || session.modified);
    const taskLabel = session.summary || truncate(session.firstPrompt, 40) || '\u2014';

    row.innerHTML = `
      <span class="badge ${cfg.class}">
        <span class="badge-icon">${cfg.icon}</span>
        ${cfg.label}
      </span>
      <span class="col-project-text" title="${esc(session.projectPath || session.projectName)}">${esc(session.projectName)}</span>
      <span class="col-task-text" title="${esc(taskLabel)}">${esc(truncate(taskLabel, 50))}</span>
      <span class="col-branch-text" title="${esc(session.gitBranch)}">${esc(truncate(session.gitBranch, 15))}</span>
      <span class="col-age-text">${age}</span>
      <span class="col-msgs-text">${session.messageCount || 0}</span>
    `;

    row.addEventListener('click', () => toggleExpand(session.sessionId));
    fragment.appendChild(row);

    // --- Accordion Detail (inline under the row) ---
    if (isExpanded) {
      const detail = document.createElement('div');
      detail.className = 'accordion-detail';
      detail.innerHTML = buildAccordionContent(session);
      fragment.appendChild(detail);
    }
  }

  $sessionList.innerHTML = '';
  $sessionList.appendChild(fragment);
}

function toggleExpand(sessionId) {
  expandedSessionId = expandedSessionId === sessionId ? null : sessionId;
  renderSessions();
}

// --- Accordion Content ---
function buildAccordionContent(session) {
  const cfg = STATUS_CONFIG[session.status] || STATUS_CONFIG.idle;

  // Left column: basic info + resume actions
  let left = `<div class="accordion-section-title">SESSION INFO</div>`;
  left += detailRow('Session', session.sessionId);
  left += detailRow('Status', `<span class="${cfg.class}">${cfg.icon} ${cfg.label}</span>`);
  left += detailRow('Project', esc(session.projectPath || session.projectName));
  left += detailRow('Branch', esc(session.gitBranch || '\u2014'), 'highlight');
  left += detailRow('Messages', String(session.messageCount || 0));

  if (session.created) {
    left += detailRow('Created', new Date(session.created).toLocaleString());
  }
  if (session.modified) {
    left += detailRow('Modified', new Date(session.modified).toLocaleString());
  }

  // Resume actions
  const resumeCmd = session.projectPath
    ? `unset CLAUDECODE && cd ${session.projectPath} && claude --resume ${session.sessionId}`
    : `unset CLAUDECODE && claude --resume ${session.sessionId}`;

  left += `
    <div class="resume-actions">
      <div class="accordion-section-title" style="margin-top: 12px;">RESUME SESSION</div>
      <div class="resume-cmd" id="resumeCmd-${session.sessionId}"><code>${esc(resumeCmd)}</code></div>
      <div class="resume-buttons">
        <button class="resume-btn resume-btn-copy" data-cmd="${esc(resumeCmd)}" data-sid="${session.sessionId}" onclick="copyResumeCmd(this); event.stopPropagation();">
          COPY
        </button>
        <button class="resume-btn resume-btn-iterm" data-sid="${session.sessionId}" data-project="${esc(session.projectPath || '')}" onclick="openInITerm(this); event.stopPropagation();">
          OPEN IN iTerm2
        </button>
      </div>
    </div>
  `;

  // Right column: prompt, stuck detail, tasks
  let right = `<div class="accordion-section-title">CONTEXT</div>`;
  right += detailRow('Prompt', esc(truncate(session.firstPrompt, 300)) || '\u2014');

  if (session.summary) {
    right += detailRow('Summary', esc(session.summary));
  }

  if (session.lastMessage) {
    right += detailRow('Last Msg', esc(truncate(session.lastMessage, 300)));
  }

  // Stuck-specific details
  if (session.detail) {
    if (session.detail.waitingTool) {
      let waitStr = esc(session.detail.waitingTool);
      if (session.detail.waitingToolInput) {
        waitStr += ` \u2014 <code>${esc(session.detail.waitingToolInput)}</code>`;
      }
      right += detailRow('Waiting', waitStr, 'warning');
    }
    if (session.detail.errorMessage) {
      right += detailRow('Error', esc(session.detail.errorMessage), 'warning');
    }
  }

  // Task progress
  if (session.tasks && session.tasks.stats) {
    const { total, completed, in_progress } = session.tasks.stats;
    const pctCompleted = total > 0 ? (completed / total) * 100 : 0;
    const pctInProgress = total > 0 ? (in_progress / total) * 100 : 0;

    right += `
      <div class="task-progress">
        <span class="detail-label">Tasks:</span>
        <div class="progress-bar">
          <div class="progress-fill progress-completed" style="width: ${pctCompleted}%"></div>
          <div class="progress-fill progress-in-progress" style="width: ${pctInProgress}%"></div>
        </div>
        <span class="progress-text">${completed}/${total} done</span>
      </div>
    `;

    if (session.tasks.tasks) {
      right += '<div style="margin-top: 6px; margin-left: 112px;">';
      for (const task of session.tasks.tasks) {
        const taskIcon = task.status === 'completed' ? '\u2713'
          : task.status === 'in_progress' ? '\u25B6'
          : '\u25CB';
        const taskColor = task.status === 'completed' ? 'var(--green-dim)'
          : task.status === 'in_progress' ? 'var(--amber)'
          : 'var(--gray)';
        right += `<div style="color: ${taskColor}; font-size: 11px;">${taskIcon} ${esc(task.subject || task.id)}</div>`;
      }
      right += '</div>';
    }
  }

  return `
    <div class="accordion-inner">
      <div class="accordion-col">${left}</div>
      <div class="accordion-col">${right}</div>
    </div>
  `;
}

function detailRow(label, value, valueClass = '') {
  return `
    <div class="detail-row">
      <span class="detail-label">${label}:</span>
      <span class="detail-value ${valueClass}">${value}</span>
    </div>
  `;
}

// --- Utilities ---
function formatAge(timestamp) {
  if (!timestamp) return '\u2014';
  const ts = typeof timestamp === 'string' ? new Date(timestamp).getTime() : timestamp;
  const diffMs = Date.now() - ts;
  if (diffMs < 0) return 'now';

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return `${seconds}s`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;

  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function truncate(str, maxLen) {
  if (!str) return '';
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 2) + '..';
}

function esc(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// --- Resume Actions ---
function copyResumeCmd(btn) {
  const cmd = btn.dataset.cmd;
  navigator.clipboard.writeText(cmd).then(() => {
    const orig = btn.textContent;
    btn.textContent = 'COPIED!';
    btn.classList.add('copied');
    setTimeout(() => {
      btn.textContent = orig;
      btn.classList.remove('copied');
    }, 1500);
  }).catch(() => {
    // Fallback for non-HTTPS
    const ta = document.createElement('textarea');
    ta.value = cmd;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    const orig = btn.textContent;
    btn.textContent = 'COPIED!';
    btn.classList.add('copied');
    setTimeout(() => {
      btn.textContent = orig;
      btn.classList.remove('copied');
    }, 1500);
  });
}

function openInITerm(btn) {
  const sessionId = btn.dataset.sid;
  const projectPath = btn.dataset.project;

  btn.textContent = 'OPENING...';
  btn.disabled = true;

  fetch('/api/open-iterm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, projectPath }),
  })
    .then((r) => r.json())
    .then((data) => {
      if (data.ok) {
        btn.textContent = 'OPENED!';
        btn.classList.add('opened');
        setTimeout(() => {
          btn.textContent = 'OPEN IN iTerm2';
          btn.classList.remove('opened');
          btn.disabled = false;
        }, 2000);
      } else {
        btn.textContent = 'FAILED';
        setTimeout(() => {
          btn.textContent = 'OPEN IN iTerm2';
          btn.disabled = false;
        }, 2000);
      }
    })
    .catch(() => {
      btn.textContent = 'FAILED';
      setTimeout(() => {
        btn.textContent = 'OPEN IN iTerm2';
        btn.disabled = false;
      }, 2000);
    });
}

// --- Event Listeners ---
$filterInput.addEventListener('input', renderSessions);
$statusFilter.addEventListener('change', renderSessions);

// Stat badges as quick filters
$statActive.addEventListener('click', () => { $statusFilter.value = 'active'; renderSessions(); });
$statStuck.addEventListener('click', () => { $statusFilter.value = 'stuck'; renderSessions(); });
$statCompleted.addEventListener('click', () => { $statusFilter.value = 'completed'; renderSessions(); });
$statIdle.addEventListener('click', () => { $statusFilter.value = 'idle'; renderSessions(); });

// Keyboard: Escape to collapse
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (expandedSessionId) {
      expandedSessionId = null;
      renderSessions();
    } else if ($legendPanel.style.display !== 'none') {
      $legendPanel.style.display = 'none';
      $helpToggle.classList.remove('active');
    }
  }
});

// --- Init ---
connect();
