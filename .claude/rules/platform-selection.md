# AI Platform Decision Framework

Use this when choosing which AI to reach for.

## Routing Table (with Fallbacks)

| Task | Primary | Fallback | Why Primary |
|------|---------|----------|-------------|
| Project architecture & CLAUDE.md | Claude | -- | Persistent memory, long-context, agentic planning |
| Multi-session refactoring | Claude | -- | Context compaction, state persistence across sessions |
| Complex debugging / error analysis | Claude | -- | Superior error analysis vs rapid generation |
| Structured JSON output generation | OpenAI (gpt-4o+) | Claude | 100% schema adherence reliability |
| Function-calling pipelines | OpenAI | -- | Most mature, production-tested function calling |
| Security audit / CVE detection | OpenAI Codex Security | -- | Threat modeling + sandbox validation + patch proposal |
| Boilerplate / repetitive code | Gemini Flash | OpenAI | Faster generation, lower cost at scale |
| Full codebase ingestion (>200K tokens) | Gemini 2.5 Pro | -- | Up to 1M+ token context; only viable option |
| YouTube / video analysis | Gemini | -- | Unique video understanding capability |
| Real-time library version checks | Perplexity Sonar | -- | Only option with live, refreshed web index |
| Deprecation notice research | Perplexity Sonar | -- | Training cutoff makes all other models stale |
| React component generation (rapid) | Gemini | Claude (review) | Speed + multimodal input; Claude reviews quality |
| API interface design | Claude | -- | Better at interface design and long-range consistency |
| Write tests for existing code | Claude | -- | Full codebase context + test execution + iteration |
| Parallel feature development | Claude Agent Teams | -- | Purpose-built multi-agent orchestration |
| UI code from design screenshot | GPT-5 or Gemini 2.5 | -- | Both strong; Gemini leads WebDev Arena |
| Extract data from 100-page PDF | Gemini or GPT-5 | -- | Gemini for massive docs; GPT-5 for mixed text+visual |

## Tiebreaker Criteria

When multiple platforms can handle a task, use these:

1. **State needed across sessions?** → Claude. Persistent memory and CLAUDE.md context are unmatched for multi-hour/multi-day work.
2. **Output must be typed JSON?** → OpenAI. 100% schema reliability means no downstream validation failures.
3. **Context exceeds ~100K tokens or involves video/image?** → Gemini. No other platform reliably processes at this scale.
4. **Need current information (past training cutoff)?** → Perplexity. Any query about current library state, recent CVEs, or live docs is a Perplexity task first.
5. **Speed and cost are primary (not quality)?** → Gemini Flash for generation, GPT-4o-mini for structured extraction.

## Fallback Routing Rules

- **Claude → OpenAI** is the safest code generation fallback (closest capability overlap)
- **Perplexity is irreplaceable** for real-time data. If unavailable, flag results as "unverified against current docs" — do not substitute a stale-training-data platform
- **Security audits should NEVER silently fallback.** If Codex Security is unavailable, gate deployment and notify rather than skipping the audit
- **Gemini is irreplaceable** for >200K token context. No fallback exists for full-codebase ingestion

## Integration Patterns

**Perplexity → Claude Code:** Use the Perplexity Web Research skill (llm CLI +
llm-perplexity plugin) for inline grounded lookups. Or run Perplexity first,
paste conclusions into CLAUDE.md.

**Gemini → Claude Code:** Use Gemini for breadth (full codebase ingestion,
finding patterns), then Claude Code for depth (targeted file-level implementation).
The two context windows are complementary: Gemini for breadth, Claude for depth.

**Codex Security → Claude Code:** After Codex Security identifies vulnerabilities,
pipe findings into a Claude Code session to implement fixes with full codebase context.
Codex Security proposes patches; Claude Code integrates them across multi-file implications.

## Rate Limit Diversification

Maintain subscriptions with 2-3 platforms to avoid being blocked during
intensive development phases. Claude Code agentic mode consumes 10-100x more
tokens than standard chat. Having a fallback prevents workflow interruption.
