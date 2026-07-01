# TONY AI Agent — Milestone v1.0

**Status:** Complete (overnight build)  
**Location:** `tony-agent/`

## Delivered

| Component | Description |
|-----------|-------------|
| Agent loop | ReAct with max 12 iterations, auto-reflect |
| Planner | JARVIS 4-stage: plan → select → execute → synthesize |
| Crew | CrewAI-style specialist delegation (4 roles) |
| Memory | Episodic (SQLite), semantic + procedural (JSON) |
| Tools | 12+ builtins: files, shell, memory, web, GitHub, SignalMint |
| Skills | 4 built-in: coding, research, signalmint, friday-brief |
| Knowledge | 20 OSS agents indexed with adopted patterns |
| LLM | mock (tests), OpenAI, Anthropic |
| Channels | CLI, HTTP REST, WebSocket; voice stub (Nova pattern) |
| Gateway | `:8787` with auth token |
| Docker | Dockerfile + compose |
| CI | `tony-agent` job in deploy.yml |

## Quick verify

```bash
cd tony-agent && npm install && npm test
npm run chat
npm start
```

## SignalMint integration

- Inbox auto-refresh every 12s (client-app)
- TONY can query SignalMint API when credentials set

## Next

See `tony-agent/ROADMAP.md` for v1.1 (Telegram, vectors, MCP).
