require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const { randomUUID } = require('crypto');
const config = require('../config');
const { runAgent } = require('../core/agent');
const memory = require('../memory');

const app = express();
app.use(express.json({ limit: '1mb' }));

function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.replace(/^Bearer\s+/i, '') || req.query.token;
  if (token !== config.apiToken) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    name: 'TONY',
    version: '1.0.0',
    llm: config.llmProvider,
    skills: require('../skills/loader').listSkills().length,
  });
});

app.post('/api/chat', auth, async (req, res) => {
  try {
    const { message, sessionId = randomUUID() } = req.body || {};
    if (!message) return res.status(400).json({ error: 'message required' });
    const result = await runAgent({ sessionId, message });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/memory/search', auth, (req, res) => {
  const q = req.query.q || '';
  res.json(memory.searchAll(q));
});

app.post('/api/memory/remember', auth, (req, res) => {
  const { text, tags } = req.body || {};
  if (!text) return res.status(400).json({ error: 'text required' });
  res.json({ ok: true, fact: memory.remember(text, tags || []) });
});

app.get('/api/skills', auth, (_req, res) => {
  res.json(require('../skills/loader').listSkills());
});

app.post('/api/crew', auth, async (req, res) => {
  try {
    const { task } = req.body || {};
    if (!task) return res.status(400).json({ error: 'task required' });
    const { runCrew } = require('../core/crew');
    const result = await runCrew(task);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/voice/status', auth, (_req, res) => {
  res.json(require('../channels/voice').voiceStatus());
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const token = url.searchParams.get('token');
  if (token !== config.apiToken) {
    ws.close(4401, 'Unauthorized');
    return;
  }

  const sessionId = url.searchParams.get('session') || randomUUID();
  ws.send(JSON.stringify({ type: 'ready', sessionId }));

  ws.on('message', async (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type !== 'chat' || !msg.message) return;
      ws.send(JSON.stringify({ type: 'thinking' }));
      const result = await runAgent({ sessionId, message: msg.message });
      ws.send(JSON.stringify({ type: 'response', ...result }));
    } catch (e) {
      ws.send(JSON.stringify({ type: 'error', error: e.message }));
    }
  });
});

if (require.main === module) {
  server.listen(config.port, () => {
    console.log(`TONY gateway listening on http://localhost:${config.port}`);
    console.log(`WebSocket: ws://localhost:${config.port}/ws?token=***`);
  });
}

module.exports = { app, server };
