/**
 * Generate realistic demo data for the Claude Session Dashboard.
 * Creates fake sessions-index.json, JSONL files, and task files.
 *
 * Usage: node scripts/generate-demo.js
 * Output: demo-data/ directory
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEMO_DIR = path.join(__dirname, '..', 'demo-data');
const PROJECTS_DIR = path.join(DEMO_DIR, 'projects');
const TASKS_DIR = path.join(DEMO_DIR, 'tasks');

// --- Demo Sessions (15 total) ---
const SESSIONS = [
  // === ACTIVE (3) ===
  {
    project: 'order-service',
    projectPath: '/Users/demo/projects/order-service',
    branch: 'feat/priority-queue',
    summary: 'Implement priority-based order processing queue',
    prompt: 'Implement a priority-based scheduling system for the order processing queue. Currently FIFO, switch to priority field sorting.',
    messages: 47,
    status: 'active',
    age: 2 * 60 * 1000, // 2 min ago
    tasks: [
      { id: '1', subject: 'Add priority field to OrderItem entity', status: 'completed' },
      { id: '2', subject: 'Implement PriorityComparator', status: 'completed' },
      { id: '3', subject: 'Update OrderQueue.poll() to use priority ordering', status: 'in_progress', activeForm: 'Updating OrderQueue poll method' },
      { id: '4', subject: 'Write unit tests for priority scheduling', status: 'pending' },
      { id: '5', subject: 'Update API docs for priority parameter', status: 'pending' },
    ],
  },
  {
    project: 'infra-charts',
    projectPath: '/Users/demo/projects/infra-charts',
    branch: 'feat/hpa-config',
    summary: 'Configure Horizontal Pod Autoscaler for payment service',
    prompt: 'Add HPA configuration for the payment-service deployment. Target CPU 70%, memory 80%.',
    messages: 23,
    status: 'active',
    age: 45 * 1000, // 45 sec ago
    tasks: [
      { id: '1', subject: 'Create HPA manifest template', status: 'completed' },
      { id: '2', subject: 'Add resource limits to deployment', status: 'completed' },
      { id: '3', subject: 'Configure values.yaml for HPA parameters', status: 'in_progress', activeForm: 'Configuring HPA values' },
    ],
  },
  {
    project: 'data-pipeline',
    projectPath: '/Users/demo/projects/data-pipeline',
    branch: 'feat/kafka-consumer',
    summary: 'Add Kafka consumer group rebalance listener',
    prompt: 'Add a rebalance listener to the Kafka consumer and implement offset commit on partition reassignment.',
    messages: 31,
    status: 'active',
    age: 90 * 1000, // 1.5 min ago
  },

  // === STUCK_PERMISSION (2) ===
  {
    project: 'infrastructure',
    projectPath: '/Users/demo/projects/infrastructure',
    branch: 'main',
    summary: 'Configure IAM roles for production services',
    prompt: 'Set up IAM roles for the production analytics service account. Needs S3 read access and DynamoDB full access.',
    messages: 18,
    status: 'stuck_permission',
    age: 5 * 60 * 1000, // 5 min ago
    waitingTool: 'Bash',
    waitingToolInput: 'aws iam attach-role-policy --role-name analytics-prod --policy-arn arn:aws:iam::policy/DynamoDBFullAccess',
  },
  {
    project: 'user-api',
    projectPath: '/Users/demo/projects/user-api',
    branch: 'feat/db-index',
    summary: 'Database migration: add composite index on events table',
    prompt: 'Create a database migration to add a composite index on (user_id, created_at) to the events table.',
    messages: 12,
    status: 'stuck_permission',
    age: 3 * 60 * 1000,
    waitingTool: 'Bash',
    waitingToolInput: 'npx knex migrate:latest --env production',
  },

  // === STUCK_ERROR (1) ===
  {
    project: 'analytics-engine',
    projectPath: '/Users/demo/projects/analytics-engine',
    branch: 'fix/query-timeout',
    summary: 'Fix ClickHouse query timeout for large date ranges',
    prompt: 'Fix the timeout error that occurs when querying date ranges longer than 30 days in ClickHouse.',
    messages: 35,
    status: 'stuck_error',
    age: 4 * 60 * 1000,
    errorMessage: 'Error: Query execution failed - DB::Exception: Timeout exceeded: elapsed 300.1s, max 300s. (TIMEOUT_EXCEEDED)',
  },

  // === STUCK_TIMEOUT (1) ===
  {
    project: 'report-worker',
    projectPath: '/Users/demo/projects/report-worker',
    branch: 'fix/oom-batch',
    summary: 'Optimize batch report generation for large datasets',
    prompt: 'Optimize the batch report generator. Currently hits OOM on datasets over 1M rows. Implement streaming or chunked processing.',
    messages: 52,
    status: 'stuck_timeout',
    age: 7 * 60 * 1000, // 7 min ago
  },

  // === COMPLETED (5) ===
  {
    project: 'notification-service',
    projectPath: '/Users/demo/projects/notification-service',
    branch: 'fix/slack-retry',
    summary: 'Fix Slack webhook retry logic on 429 rate limit',
    prompt: 'Fix the bug where Slack webhook retry logic does not trigger on HTTP 429 rate limit responses.',
    messages: 28,
    status: 'completed',
    age: 30 * 60 * 1000, // 30 min ago
    tasks: [
      { id: '1', subject: 'Identify rate limit handling code', status: 'completed' },
      { id: '2', subject: 'Add exponential backoff retry', status: 'completed' },
      { id: '3', subject: 'Write integration tests', status: 'completed' },
    ],
  },
  {
    project: 'terraform-aws',
    projectPath: '/Users/demo/projects/terraform-aws',
    branch: 'feat/sso-roles',
    summary: 'Add SSO permission sets for developer role',
    prompt: 'Add an AWS SSO developer permission set with EC2, S3, CloudWatch read access and Lambda full access.',
    messages: 15,
    status: 'completed',
    age: 2 * 3600 * 1000, // 2 hours ago
  },
  {
    project: 'marketplace-api',
    projectPath: '/Users/demo/projects/marketplace-api',
    branch: 'feat/search',
    summary: 'Implement Elasticsearch full-text search endpoint',
    prompt: 'Build a product search API backed by Elasticsearch. Include full-text search with autocomplete support.',
    messages: 64,
    status: 'completed',
    age: 5 * 3600 * 1000,
    tasks: [
      { id: '1', subject: 'Set up Elasticsearch index with custom analyzer', status: 'completed' },
      { id: '2', subject: 'Create SearchService with query builder', status: 'completed' },
      { id: '3', subject: 'Add autocomplete suggest endpoint', status: 'completed' },
      { id: '4', subject: 'Implement search result pagination', status: 'completed' },
      { id: '5', subject: 'Add search analytics logging', status: 'completed' },
    ],
  },
  {
    project: 'monitoring',
    projectPath: '/Users/demo/projects/monitoring',
    branch: 'feat/error-alarm',
    summary: 'Add CloudWatch alarm for API error rate threshold',
    prompt: 'Set up a CloudWatch alarm that triggers when the API error rate exceeds 5%. Send alerts via SNS to Slack.',
    messages: 11,
    status: 'completed',
    age: 1 * 3600 * 1000,
  },
  {
    project: 'internal-cli',
    projectPath: '/Users/demo/projects/internal-cli',
    branch: 'main',
    summary: 'Add interactive deployment status command',
    prompt: 'Add a `deploy-status` command that integrates with the ArgoCD API to show current deployment status interactively.',
    messages: 42,
    status: 'completed',
    age: 12 * 3600 * 1000,
  },

  // === IDLE (3) ===
  {
    project: 'etl-workflows',
    projectPath: '/Users/demo/projects/etl-workflows',
    branch: 'feat/dag-refactor',
    summary: 'Refactor ETL DAG into modular task groups',
    prompt: 'Refactor the monolithic ETL DAG into modular task groups. Split the single large DAG into multiple sub-DAGs.',
    messages: 8,
    status: 'idle',
    age: 3 * 24 * 3600 * 1000, // 3 days ago
  },
  {
    project: 'olap-benchmark',
    projectPath: '/Users/demo/projects/olap-benchmark',
    branch: 'main',
    summary: 'Benchmark ClickHouse vs StarRocks for OLAP workloads',
    prompt: 'Run a comparative benchmark between ClickHouse and StarRocks using TPC-H queries.',
    messages: 73,
    status: 'idle',
    age: 7 * 24 * 3600 * 1000, // 7 days ago
  },
  {
    project: 'event-gateway',
    projectPath: '/Users/demo/projects/event-gateway',
    branch: 'feat/rate-limit',
    summary: 'Implement token bucket rate limiter for event ingestion',
    prompt: 'Implement a token bucket rate limiter on the event ingestion endpoint. Limit to 1000 req/sec per app.',
    messages: 19,
    status: 'idle',
    age: 14 * 24 * 3600 * 1000, // 14 days ago
  },
];

// --- Helpers ---
function uuid() {
  return crypto.randomUUID();
}

function buildJsonlMessages(session) {
  const lines = [];
  const sessionId = session._sessionId;
  const now = Date.now();
  const baseTime = now - session.age;

  // System init message
  lines.push(JSON.stringify({
    parentUuid: uuid(),
    isSidechain: false,
    userType: 'external',
    cwd: session.projectPath,
    sessionId,
    version: '2.1.47',
    gitBranch: session.branch,
    type: 'summary',
    summary: session.summary,
  }));

  // User's initial prompt
  lines.push(JSON.stringify({
    parentUuid: uuid(),
    isSidechain: false,
    userType: 'external',
    cwd: session.projectPath,
    sessionId,
    version: '2.1.47',
    gitBranch: session.branch,
    message: {
      role: 'user',
      content: [{ type: 'text', text: session.prompt }],
    },
  }));

  // Simulate some back-and-forth
  const exchanges = Math.min(Math.floor(session.messages / 2), 5);
  for (let i = 0; i < exchanges; i++) {
    // Assistant response with tool_use
    const toolName = ['Bash', 'Read', 'Edit', 'Write', 'Grep', 'Glob'][i % 6];
    lines.push(JSON.stringify({
      parentUuid: uuid(),
      isSidechain: false,
      cwd: session.projectPath,
      sessionId,
      gitBranch: session.branch,
      message: {
        role: 'assistant',
        content: [
          { type: 'text', text: `Analyzing the codebase for ${session.summary.toLowerCase()}...` },
          { type: 'tool_use', id: `toolu_${uuid().slice(0, 20)}`, name: toolName, input: { command: `find . -name "*.java" -type f`, file_path: `/src/main/${toolName.toLowerCase()}.java` } },
        ],
      },
    }));

    // User tool_result
    lines.push(JSON.stringify({
      parentUuid: uuid(),
      isSidechain: false,
      cwd: session.projectPath,
      sessionId,
      gitBranch: session.branch,
      message: {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: `toolu_${uuid().slice(0, 20)}`, content: 'Command executed successfully.' },
        ],
      },
    }));
  }

  // Final messages based on desired status
  if (session.status === 'stuck_permission') {
    // End with tool_use, no tool_result
    lines.push(JSON.stringify({
      parentUuid: uuid(),
      isSidechain: false,
      cwd: session.projectPath,
      sessionId,
      gitBranch: session.branch,
      message: {
        role: 'assistant',
        content: [
          { type: 'text', text: 'I need to run this command to proceed.' },
          {
            type: 'tool_use',
            id: `toolu_${uuid().slice(0, 20)}`,
            name: session.waitingTool || 'Bash',
            input: { command: session.waitingToolInput || 'echo "waiting"' },
          },
        ],
      },
    }));
  } else if (session.status === 'stuck_error') {
    // End with error tool_result
    lines.push(JSON.stringify({
      parentUuid: uuid(),
      isSidechain: false,
      cwd: session.projectPath,
      sessionId,
      gitBranch: session.branch,
      message: {
        role: 'assistant',
        content: [
          { type: 'tool_use', id: `toolu_err`, name: 'Bash', input: { command: 'npm test' } },
        ],
      },
    }));
    lines.push(JSON.stringify({
      parentUuid: uuid(),
      isSidechain: false,
      cwd: session.projectPath,
      sessionId,
      gitBranch: session.branch,
      message: {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 'toolu_err', is_error: true, content: session.errorMessage || 'Error: command failed' },
        ],
      },
    }));
  } else if (session.status === 'completed') {
    // End with a clean assistant text response
    lines.push(JSON.stringify({
      parentUuid: uuid(),
      isSidechain: false,
      cwd: session.projectPath,
      sessionId,
      gitBranch: session.branch,
      message: {
        role: 'assistant',
        content: [
          { type: 'text', text: `All changes have been implemented and tests are passing. Here\'s a summary of what was done:\n\n1. ${session.summary}\n2. Updated relevant test files\n3. Verified no regressions\n\nThe implementation is complete. You can review the changes with \`git diff\`.` },
        ],
      },
    }));
  } else {
    // active / stuck_timeout / idle — end with assistant tool_use + tool_result (normal state)
    lines.push(JSON.stringify({
      parentUuid: uuid(),
      isSidechain: false,
      cwd: session.projectPath,
      sessionId,
      gitBranch: session.branch,
      message: {
        role: 'assistant',
        content: [
          { type: 'text', text: `Working on ${session.summary.toLowerCase()}...` },
          { type: 'tool_use', id: 'toolu_last', name: 'Edit', input: { file_path: '/src/main/App.java' } },
        ],
      },
    }));
    lines.push(JSON.stringify({
      parentUuid: uuid(),
      isSidechain: false,
      cwd: session.projectPath,
      sessionId,
      gitBranch: session.branch,
      message: {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 'toolu_last', content: 'File edited successfully.' },
        ],
      },
    }));
    // Then a text continuation (so active sessions look alive)
    lines.push(JSON.stringify({
      parentUuid: uuid(),
      isSidechain: false,
      cwd: session.projectPath,
      sessionId,
      gitBranch: session.branch,
      message: {
        role: 'assistant',
        content: [
          { type: 'text', text: `Continuing with the implementation. Let me update the next file...` },
          { type: 'tool_use', id: 'toolu_cont', name: 'Read', input: { file_path: '/src/test/AppTest.java' } },
        ],
      },
    }));
    lines.push(JSON.stringify({
      parentUuid: uuid(),
      isSidechain: false,
      cwd: session.projectPath,
      sessionId,
      gitBranch: session.branch,
      message: {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 'toolu_cont', content: 'package com.example;\n\nimport org.junit.Test;\n\npublic class AppTest {\n  @Test\n  public void testMain() {\n    // test\n  }\n}' },
        ],
      },
    }));
  }

  return lines.join('\n') + '\n';
}

// --- Main ---
function generate() {
  // Clean
  fs.rmSync(DEMO_DIR, { recursive: true, force: true });

  const now = Date.now();

  // Group sessions by project for sessions-index.json
  const byProject = new Map();

  for (const session of SESSIONS) {
    session._sessionId = uuid();

    const slug = session.projectPath.replace(/\//g, '-');
    if (!byProject.has(slug)) {
      byProject.set(slug, []);
    }
    byProject.get(slug).push(session);
  }

  for (const [slug, sessions] of byProject) {
    const projectDir = path.join(PROJECTS_DIR, slug);
    fs.mkdirSync(projectDir, { recursive: true });

    const entries = [];

    for (const session of sessions) {
      const jsonlPath = path.join(projectDir, `${session._sessionId}.jsonl`);

      // Write JSONL
      const jsonlContent = buildJsonlMessages(session);
      fs.writeFileSync(jsonlPath, jsonlContent);

      // Set mtime based on age
      const mtime = new Date(now - session.age);
      // For active/stuck sessions, set mtime to very recent so they appear "running"
      if (session.status === 'active') {
        fs.utimesSync(jsonlPath, new Date(), new Date(now - session.age));
      } else if (session.status.startsWith('stuck_')) {
        fs.utimesSync(jsonlPath, new Date(), new Date(now - session.age));
      } else {
        fs.utimesSync(jsonlPath, mtime, mtime);
      }

      const created = new Date(now - session.age - (session.messages * 60 * 1000));

      entries.push({
        sessionId: session._sessionId,
        fullPath: jsonlPath,
        fileMtime: now - session.age,
        firstPrompt: session.prompt,
        summary: session.summary,
        messageCount: session.messages,
        created: created.toISOString(),
        modified: new Date(now - session.age).toISOString(),
        gitBranch: session.branch,
        projectPath: session.projectPath,
        isSidechain: false,
      });

      // Write tasks if present
      if (session.tasks) {
        const taskDir = path.join(TASKS_DIR, session._sessionId);
        fs.mkdirSync(taskDir, { recursive: true });
        for (const task of session.tasks) {
          fs.writeFileSync(
            path.join(taskDir, `${task.id}.json`),
            JSON.stringify(task, null, 2)
          );
        }
        fs.writeFileSync(path.join(taskDir, '.lock'), '');
        fs.writeFileSync(path.join(taskDir, '.highwatermark'), String(session.tasks.length));
      }
    }

    // Write sessions-index.json
    fs.writeFileSync(
      path.join(projectDir, 'sessions-index.json'),
      JSON.stringify({ version: 1, entries }, null, 2)
    );
  }

  console.log(`[demo] Generated ${SESSIONS.length} sessions in ${DEMO_DIR}`);
  console.log('[demo] Projects:', [...byProject.keys()].length);
  console.log('[demo] Run with: npm run demo');
}

generate();
