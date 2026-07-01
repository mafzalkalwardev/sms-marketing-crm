const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const config = require('../config');
const memory = require('../memory');

function safePath(relative) {
  const resolved = path.resolve(config.workspaceRoot, relative);
  if (!resolved.startsWith(path.resolve(config.workspaceRoot))) {
    throw new Error('Path escapes workspace root');
  }
  return resolved;
}

const builtins = {
  read_file: {
    name: 'read_file',
    description: 'Read a text file from the workspace',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Relative file path' } },
      required: ['path'],
    },
    async execute({ path: filePath }) {
      const full = safePath(filePath);
      if (!fs.existsSync(full)) return { ok: false, error: `File not found: ${filePath}` };
      const content = fs.readFileSync(full, 'utf8');
      return { ok: true, path: filePath, content: content.slice(0, 12000) };
    },
  },

  list_directory: {
    name: 'list_directory',
    description: 'List files in a workspace directory',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Relative directory', default: '.' } },
    },
    async execute({ path: dir = '.' }) {
      const full = safePath(dir);
      const entries = fs.readdirSync(full, { withFileTypes: true }).map((e) => ({
        name: e.name,
        type: e.isDirectory() ? 'dir' : 'file',
      }));
      return { ok: true, path: dir, entries };
    },
  },

  memory_search: {
    name: 'memory_search',
    description: 'Search episodic, semantic, and procedural memory',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
    },
    async execute({ query }) {
      return { ok: true, results: memory.searchAll(query) };
    },
  },

  memory_remember: {
    name: 'memory_remember',
    description: 'Store a fact in long-term semantic memory',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
      },
      required: ['text'],
    },
    async execute({ text, tags = [] }) {
      const fact = memory.remember(text, tags);
      return { ok: true, fact };
    },
  },

  list_skills: {
    name: 'list_skills',
    description: 'List loaded agent skills',
    parameters: { type: 'object', properties: {} },
    async execute() {
      const { listSkills } = require('../skills/loader');
      return { ok: true, skills: listSkills() };
    },
  },

  knowledge_search: {
    name: 'knowledge_search',
    description: 'Search curated open-source agent knowledge index',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
    },
    async execute({ query }) {
      const index = require('../knowledge/agents-index.json');
      const q = query.toLowerCase();
      const hits = index.agents.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.patterns.some((p) => p.toLowerCase().includes(q)) ||
          a.description.toLowerCase().includes(q)
      );
      return { ok: true, hits: hits.slice(0, 8) };
    },
  },

  web_fetch: {
    name: 'web_fetch',
    description: 'Fetch a public HTTP URL (read-only)',
    parameters: {
      type: 'object',
      properties: { url: { type: 'string' } },
      required: ['url'],
    },
    async execute({ url }) {
      if (!/^https?:\/\//i.test(url)) return { ok: false, error: 'Only http(s) URLs allowed' };
      const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
      const text = await response.text();
      return { ok: true, status: response.status, body: text.slice(0, 8000) };
    },
  },

  shell: {
    name: 'shell',
    description: 'Run a safe read-only shell command in workspace (ls, git status, npm test)',
    parameters: {
      type: 'object',
      properties: { command: { type: 'string' } },
      required: ['command'],
    },
    async execute({ command }) {
      const allowed = /^(git status|git log|git diff|npm test|npm run test|ls|dir|node scripts\/)/i;
      if (!allowed.test(command.trim())) {
        return { ok: false, error: 'Command not in allowlist. Use read_file or ask user to run manually.' };
      }
      const out = execSync(command, {
        cwd: config.workspaceRoot,
        encoding: 'utf8',
        timeout: 60000,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      return { ok: true, output: out.slice(0, 8000) };
    },
  },
};

// SignalMint tools
let signalmintToken = null;

async function signalmintLogin() {
  if (signalmintToken) return signalmintToken;
  const { apiUrl, email, password } = config.signalmint;
  if (!email || !password) throw new Error('SIGNALMINT_EMAIL/PASSWORD not configured');
  const res = await fetch(`${apiUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!data.token) throw new Error('SignalMint login failed');
  signalmintToken = data.token;
  return signalmintToken;
}

async function signalmintApi(pathname, options = {}) {
  const token = await signalmintLogin();
  const res = await fetch(`${config.signalmint.apiUrl}${pathname}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

builtins.signalmint_health = {
  name: 'signalmint_health',
  description: 'Check SignalMint API health',
  parameters: { type: 'object', properties: {} },
  async execute() {
    const res = await fetch(`${config.signalmint.apiUrl}/api/health`);
    const data = await res.json();
    return { ok: true, health: data };
  },
};

builtins.signalmint_workspace = {
  name: 'signalmint_workspace',
  description: 'Get SignalMint workspace usage summary',
  parameters: { type: 'object', properties: {} },
  async execute() {
    try {
      const data = await signalmintApi('/api/user/workspace');
      return { ok: true, workspace: data };
    } catch (e) {
      return { ok: false, error: e.message, hint: 'Start SignalMint API or set credentials' };
    }
  },
};

builtins.signalmint_conversations = {
  name: 'signalmint_conversations',
  description: 'List SMS conversations in SignalMint',
  parameters: { type: 'object', properties: {} },
  async execute() {
    const data = await signalmintApi('/api/conversations');
    return { ok: true, conversations: data };
  },
};

builtins.github_search = {
  name: 'github_search',
  description: 'Search GitHub repositories (requires GITHUB_TOKEN)',
  parameters: {
    type: 'object',
    properties: { query: { type: 'string' } },
    required: ['query'],
  },
  async execute({ query }) {
    if (!config.githubToken) {
      return { ok: false, error: 'GITHUB_TOKEN not set' };
    }
    const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&per_page=5`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${config.githubToken}`,
        Accept: 'application/vnd.github+json',
      },
    });
    const data = await res.json();
    return {
      ok: true,
      items: (data.items || []).map((i) => ({
        name: i.full_name,
        stars: i.stargazers_count,
        description: i.description,
        url: i.html_url,
      })),
    };
  },
};

function listTools() {
  return Object.values(builtins);
}

function getTool(name) {
  return builtins[name] || null;
}

async function executeTool(name, args, sessionId) {
  const tool = getTool(name);
  if (!tool) return { ok: false, error: `Unknown tool: ${name}` };
  try {
    const result = await tool.execute(args || {});
    memory.appendToolTrace(sessionId, name, args, JSON.stringify(result), result.ok !== false);
    return result;
  } catch (e) {
    memory.appendToolTrace(sessionId, name, args, e.message, false);
    return { ok: false, error: e.message };
  }
}

module.exports = { listTools, getTool, executeTool, builtins };
