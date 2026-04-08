# Blade Super Agent

AI-powered coding agent that clones repos, writes code, runs tests, and opens pull requests autonomously.

## Tech Stack

- **Language:** TypeScript (strict mode, ESM modules)
- **Runtime:** Node.js 20+
- **Monorepo:** npm workspaces + Turborepo
- **Database:** SQLite via better-sqlite3
- **AI:** Anthropic Claude API (Messages API)
- **Containerization:** Docker (isolated coding environments)

## Build

```bash
npm install && npx turbo build
```

## Run

```bash
blade setup    # Interactive configuration wizard
blade chat     # Chat with Blade
blade code "Add a health check endpoint" --repo=https://github.com/user/repo
blade jobs     # View coding jobs
blade costs    # View spending
```

## Package Structure

```
apps/
  cli/          — CLI entry point (`blade` command)
packages/
  core/         — Agent loop, tool registry, coding pipeline
  db/           — SQLite database, repositories (jobs, memories, costs)
  shared/       — Logger, config loader, environment utilities
  docker-runner/ — Docker container management for isolated coding
```

## Key Conventions

- **TypeScript strict** — No `any`, explicit return types on exports
- **ESM modules** — All packages use `"type": "module"` with `.js` extensions in imports
- **Immutable patterns** — Create new objects, never mutate existing ones
- **Error handling** — Always narrow `unknown` errors, never silently swallow
- **File size** — Keep files under 400 lines, extract utilities when growing
- **Config** — User config lives at `~/.blade/config.json`, secrets in `.env`
- **Database** — All DB access goes through repository functions in `@blade/db`
