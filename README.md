# Blade Super Agent

**The AI agent that learns AND ships code.**

Blade is an autonomous AI agent platform that combines self-improving intelligence with a real coding pipeline. Give it a task, it writes the code, runs the tests, and opens a PR — then remembers what worked for next time.

## What It Does

- **Chat** — Talk to Blade in the web UI or terminal. It remembers your preferences across sessions.
- **Code** — Give Blade a coding task and a repo. It clones, branches, codes, tests, commits, and opens a PR.
- **Learn** — Blade saves skills from completed tasks and improves them over time. It gets better the more you use it.
- **Track** — Every action is logged. Every dollar spent is tracked. Full visibility, no surprises.

## Quick Start

```bash
# Install
git clone https://github.com/blade-agent/blade-super-agent.git
cd blade-super-agent
npm install
npx turbo build

# Setup (interactive wizard — configures API keys, model, budget)
node apps/cli/dist/index.js setup

# Chat
node apps/cli/dist/index.js chat

# Give it a coding task
node apps/cli/dist/index.js code "Add a health check endpoint" --repo=https://github.com/you/your-repo

# Start the web dashboard
cd apps/web && npm run dev
# Visit http://localhost:3000
```

## Use Your Claude Subscription

Don't want to pay per API call? Use your existing Claude Pro/Max subscription:

```bash
# During setup, choose option 1
node apps/cli/dist/index.js setup

# Or manually: install Claude Code CLI and generate a token
npm install -g @anthropic-ai/claude-code
claude setup-token
# Paste the sk-ant-oat01-... token when prompted
```

## Architecture

```
┌─────────────────────────────────────────────────┐
│                  BLADE SUPER AGENT               │
├─────────────────────────────────────────────────┤
│  apps/web        Next.js dashboard + chat UI     │
│  apps/cli        Terminal interface              │
├─────────────────────────────────────────────────┤
│  packages/core   Agent loop, tools, memory,      │
│                  skills, coding pipeline          │
│  packages/db     SQLite + FTS5 search            │
│  packages/docker-runner  Container sandbox       │
│  packages/shared Logger, config, env             │
├─────────────────────────────────────────────────┤
│  docker/         Sandbox Dockerfile              │
│  skills/         Built-in skill definitions      │
└─────────────────────────────────────────────────┘
```

## Features

| Feature | Status |
|---------|--------|
| Interactive chat with tool use | ✅ |
| Streaming responses (SSE) | ✅ |
| Persistent memory (SQLite + FTS5) | ✅ |
| Self-improving skill system | ✅ |
| Docker sandboxed code execution | ✅ |
| Git branch → code → PR pipeline | ✅ |
| Cost tracking per task | ✅ |
| Multi-model support (Claude, GPT, OpenRouter) | ✅ |
| Web search (Tavily, SerpAPI, Exa) | ✅ |
| OAuth subscription auth | ✅ |
| Web dashboard | ✅ |
| CLI interface | ✅ |

## Tech Stack

- **TypeScript** monorepo (Turborepo)
- **Next.js 14** web dashboard
- **SQLite** with FTS5 full-text search
- **Anthropic SDK** for Claude models
- **Docker** for sandboxed execution
- **Octokit** for GitHub PR creation

## Commands

```bash
blade               # Setup if new, chat if configured
blade setup          # Interactive setup wizard
blade chat           # Chat with Blade in terminal
blade code "task"    # Give Blade a coding task
blade jobs           # List coding jobs
blade memory         # View stored memories
blade costs          # View spending summary
```

## License

MIT
