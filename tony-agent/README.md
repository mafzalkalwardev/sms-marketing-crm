# TONY AI Agent

**TONY** (Tactical Omniscient Neural Yielder) is a self-hosted autonomous AI agent combining the strongest patterns from modern open-source agent systems:

| Source | Pattern adopted |
|--------|-----------------|
| [Microsoft JARVIS / HuggingGPT](https://github.com/microsoft/JARVIS) | 4-stage pipeline: plan → select → execute → synthesize |
| [OpenClaw](https://github.com/openclaw/openclaw) | Gateway, skills workspace, session model, local-first |
| [CrewAI](https://github.com/joaomdmoura/crewAI) | Role-based specialist routing |
| [LangGraph](https://github.com/langchain-ai/langgraph) | Stateful multi-step graphs with checkpoints |
| [AutoGPT](https://github.com/Significant-Gravitas/AutoGPT) | Goal decomposition + tool loops |
| [Dapr Agents](https://github.com/dapr/dapr-agents) | Durable state, fault-tolerant execution |

## Quick start

```bash
cd tony-agent
cp .env.example .env
npm install
npm test          # runs with mock LLM (no API key)
npm run chat      # interactive CLI
npm start         # gateway on :8787
```

## CLI

```bash
npm run chat                    # Interactive session
npm run run -- "Summarize ROADMAP.md"
npm run remember -- "User prefers dark mode"
npm run skills                  # List loaded skills
```

## HTTP API

```bash
# Health
curl http://localhost:8787/health

# Chat (Bearer TONY_API_TOKEN)
curl -X POST http://localhost:8787/api/chat \
  -H "Authorization: Bearer $TONY_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message":"What is SignalMint?"}'

# WebSocket: ws://localhost:8787/ws?token=YOUR_TOKEN
```

## Architecture

```
tony-agent/
├── src/
│   ├── core/        agent loop, planner, executor, reflector
│   ├── llm/         OpenAI, Anthropic, mock providers
│   ├── memory/      episodic (SQLite), semantic, procedural
│   ├── tools/       filesystem, shell, memory, web, github, signalmint
│   ├── skills/      SKILL.md loader (Cursor/OpenClaw style)
│   ├── gateway/     Express + WebSocket server
│   └── knowledge/   curated agent patterns index
├── skills/          built-in + user skills
└── data/            memory DB (gitignored)
```

## Memory

TONY remembers across sessions:

- **Episodic** — full conversation + tool trace in `data/memory.db`
- **Semantic** — facts and preferences (`data/semantic.json`)
- **Procedural** — learned playbooks (`data/procedural.json`)
- **Knowledge** — `src/knowledge/agents-index.json` references 20+ OSS agents

## SignalMint integration

With `SIGNALMINT_API_URL` set, TONY can:

- List conversations and send SMS
- Preview and enqueue campaigns
- Check compliance suppressions
- Pull workspace usage reports

## LLM providers

| Provider | Env |
|----------|-----|
| `mock` | No key — pattern-matching for tests |
| `openai` | `OPENAI_API_KEY`, `OPENAI_MODEL` |
| `anthropic` | `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` |

## Docker

```bash
docker compose up -d
```

## License

MIT — same as parent SignalMint monorepo.
