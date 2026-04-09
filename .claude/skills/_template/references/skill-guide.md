# Skill Development Guide

## When to Create a Skill
Any task you brief Claude on more than once is a skill candidate.
One skill per task. The more you build, the less you brief.

## Skill Categories

Two fundamental categories:

**Capability Uplift** — gives Claude abilities it fundamentally lacks without
the skill. Examples: web scraping (Firecrawl), browser testing (Playwright),
security analysis (CodeQL/Semgrep), PDF/DOCX creation, YouTube search.

**Encoded Preference** — guides Claude to follow your team's specific workflow
for tasks it already knows. Examples: TDD enforcement, commit message formats,
design system patterns, code review checklists, ad copy standards.

When creating a skill, decide which category it falls into. Capability Uplift
skills need scripts and tool access. Encoded Preference skills are pure
instructions and conventions.

## Cross-Platform Portability

The Agent Skills specification is an open standard adopted by:
- Claude Code
- Gemini CLI
- OpenAI Codex CLI
- Cursor

Skills you write once work across all these tools without modification.
The SKILL.md format with YAML frontmatter is the portable unit. Invest
in skills — they're a durable, portable asset across platforms.

## Skill Types

| Type | Best For | Example Triggers |
|------|----------|-----------------|
| **Voice** | Writing consistently in your tone across all content | "write a post", "draft email" |
| **Format** | Reports, SOPs, briefs always structured correctly | "create a report", "write a doc" |
| **Research** | Competitive intel, summarizing data fast | "research this", "analyze" |
| **Review** | Proofreading against your own standards and rules | "review this", "check this" |
| **Workflow** | Multi-step repeatable tasks executed end-to-end | "run the process" |

## Development Workflow

1. **Identify** — notice you're briefing Claude on the same task again
2. **Create** — make a skill folder with SKILL.md (Role, Rules, Trigger)
3. **Test immediately** — run your first task right away
4. **Brief on misses** — update Gotchas based on what Claude gets wrong
5. **Build the library** — one skill per task, compound over time

## Four Mistakes That Kill Skills

### 1. Writing a skill that tries to do everything
One skill = one task. If it needs to do two things, make two skills
and chain them via a super skill.

### 2. Skipping the trigger definition
Without a clear trigger, Claude doesn't know when to use the skill.
The description field and the Trigger section must define WHEN this
activates — specific phrases, situations, patterns.

### 3. Never updating after Claude misses
The Gotchas section is where skills actually improve. If you don't
add mistakes to it, the skill never gets better. Test, fail, document,
repeat.

### 4. Building it perfectly before using it
Start rough. Use it. Fix what breaks. A skill with 10 gotchas from
real use outperforms a "perfect" skill written in isolation.
