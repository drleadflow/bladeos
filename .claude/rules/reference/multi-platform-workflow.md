# Multi-Platform Development Workflow

No single AI platform dominates every facet of development. Use each
for its core strength, hand off between them at phase boundaries.

## 6-Phase Lifecycle

### Phase 1: Research & Planning (Perplexity)
- Research libraries, evaluate options, check current docs
- Compare frameworks with real-time citations
- Investigate breaking changes and migration guides
- Feed findings into CLAUDE.md or prompt context

### Phase 2: Architecture & Design Review (Gemini)
- Ingest full codebase + spec in one prompt (1M token context)
- Gap analysis: what's implemented vs what's required
- Analyze architecture diagrams or design documents
- Pattern detection across large codebases

### Phase 3: Implementation (Claude Code)
- Autonomous multi-file coding with hooks, skills, CLAUDE.md context
- Multi-agent orchestration for parallel feature development
- Full git workflow: branch, commit, PR
- Test execution and iteration loop

### Phase 4: Security Audit (OpenAI Codex Security)
- Run on completed feature branches before merge
- Sandbox-validated vulnerability detection
- Remediation code proposals with test generation
- Enterprise tier required

### Phase 5: Visual/Multimodal Review (OpenAI GPT-5)
- Compare implementation screenshots vs design specs
- Analyze error screenshots alongside code
- Extract data from PDFs and documents
- Mixed text + visual reasoning

### Phase 6: Documentation & Tutorial Extraction (Gemini)
- Analyze YouTube talks or video tutorials
- Generate codebase documentation with full-context ingestion
- Process video at 1fps with audio for implementation steps

## Context Handoffs

When switching platforms, compress prior-phase outputs to under 800 tokens.

- **Preserve:** key decisions, affected files, constraints discovered, acceptance criteria
- **Discard:** raw tool outputs, verbose reasoning, logs, implementation details
- Paste conclusions into CLAUDE.md under relevant sections
- Use `tasks/NOTES.md` as the portable handoff document
- Every handoff should include explicit instructions for what the receiving platform should do with the data

## Platform Strengths at a Glance

| Platform | Best For | Context |
|----------|----------|---------|
| Claude Code | Deep coding, agents, git workflows | 200K tokens |
| OpenAI | Security auditing, structured JSON, multimodal | 128-200K tokens |
| Gemini | Breadth (full codebase), video/YouTube | 1M tokens |
| Perplexity | Real-time research, library evaluation | Retrieval-based |

## Multi-Model Project Setup Checklist

When starting a project that uses multiple AI platforms:

- [ ] Define task → platform mapping (use `platform-selection.md`)
- [ ] Document project architecture in CLAUDE.md (committed to git)
- [ ] Enable prompt caching for repeated system prompts (see `token-budgeting.md`)
- [ ] Define context tiers: what always passes, what passes selectively, what passes sparingly
- [ ] Set up fallback routing rules (Claude→OpenAI for code, Perplexity irreplaceable for real-time)
- [ ] Validate Perplexity research freshness before using as architecture input
- [ ] Never silently fallback on security audits — gate deployment instead
- [ ] Compress cross-platform handoffs to <800 tokens with explicit instructions
- [ ] Track per-phase token costs to catch cost regressions early
