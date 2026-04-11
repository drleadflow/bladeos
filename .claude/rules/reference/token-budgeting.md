# Token Budgeting

## Agentic Mode Cost Reality

Claude Code agentic mode consumes 10-100x more tokens than standard chat.
A single agentic command generates 8-12 internal API calls, consuming
50,000-150,000 tokens. File reads, tool calls, and internal reasoning
consume tokens that don't appear as visible messages.

## Monitoring

Use `/tokens` during Claude Code sessions to monitor consumption.
Set explicit scope boundaries before starting complex tasks to avoid
hitting rate limits mid-work.

## Cost Hierarchy (Cheapest → Most Expensive)

For equivalent quality generation tasks:
```
Gemini Flash → GPT-4o-mini → Claude Haiku → Gemini Pro → GPT-4o → Claude Sonnet → Claude Opus
```

Use this to pick the cheapest model that meets quality requirements:
- **Classification / routing:** GPT-4o-mini or Claude Haiku (never frontier models)
- **Boilerplate generation:** Gemini Flash > OpenAI > Claude
- **Synthesis / merging:** GPT-4o-mini unless it requires architectural reasoning
- **Full security audit:** OpenAI Codex Security (one-time per-PR cost, not per-token)

## Prompt Caching

Highest-leverage cost optimization available:
- **Anthropic:** 90% cost reduction on cache hits, 25% premium on cache writes.
  Break-even at just 2 cache reads. Enable `cache_control` for any prompt sent >2 times.
- **OpenAI:** 50-90% automatic caching discounts on repeated prompts.
- **Gemini:** Context caching with 15-minute window for multi-turn document Q&A.

Place static content (system prompts, CLAUDE.md, tool definitions) at the
prompt prefix to maximize cache hits across calls.

## Context Window Tiered Strategy

When passing context between platforms or to subagents:

| Tier | Size | Rule |
|------|------|------|
| **Tier 1: Always pass** | < 500 tokens | Executive summary, current phase, key decisions. Every platform call gets this. |
| **Tier 2: Pass when relevant** | 500-5,000 tokens | Structured outputs from immediately prior phases. Only if the receiving platform needs them. |
| **Tier 3: Pass sparingly** | > 5,000 tokens | Full raw outputs, entire codebases, long research docs. Only to the platform that explicitly needs them (Gemini for codebase, Claude for refactoring). |

## Context Compression for Cross-Platform Handoffs

Before injecting prior-phase outputs into a new platform's prompt,
summarize to under 800 tokens. Include: key decisions, affected files,
constraints discovered. Discard: raw outputs, verbose reasoning, logs.
This reduces inter-platform token costs by 60-80%.

## Cost Management Strategies

- **Scope narrowly:** "Fix the auth bug in src/auth/login.ts" not "improve auth"
- **Use subagents for exploration:** keeps verbose output out of main context
- **Set effort levels:** `effort: low` for simple lookups, `high` for complex work
- **Use Haiku for simple agents:** explorers, file readers, grep tasks
- **Use Sonnet for implementation:** standard coding work
- **Reserve Opus for:** architectural decisions, complex multi-step reasoning

## Platform Cost Comparison

| Platform | Individual Cost | Token Window | Agentic Mode |
|----------|----------------|-------------|-------------|
| Claude Code Pro | $20/mo | 200K | Yes (rate-limited) |
| Claude Code Max 5x | $100/mo | 200K | Yes (5x limits) |
| Claude Code Max 20x | $200/mo | 200K | Yes (20x limits) |
| OpenAI Codex | $200/mo | 128-200K | Cloud sandbox |
| Gemini | Free tier + API | 1M | Gemini CLI |
| Perplexity Pro | $20/mo | Retrieval | 20 deep research/day |

## When to Use API vs Subscription

Use API (pay-per-token) for highly variable heavy usage.
Use subscription for predictable daily development.
