---
name: skill-name
description: >
  What this skill does and when Claude should use it. Third person.
  Include trigger phrases users would naturally say. Be specific —
  Claude undertriggers by default, so include "Use when..." or
  "Use proactively when..." phrases.
  Example triggers: "write a post", "run the process", "review this"
# Optional fields:
# disable-model-invocation: true    # For side-effect skills (deploy, commit, send)
# user-invocable: false             # Background knowledge only Claude loads
# allowed-tools: Read, Grep, Bash   # Lock down tool access
# context: fork                     # Run in isolated subagent
# agent: Explore                    # Which subagent type for forked execution
# effort: medium                    # low | medium | high | max (max = Opus 4.6 only)
# argument-hint: "<query>"          # Autocomplete hint for /skill-name
---

# Skill Name

<background_information>
What this skill is and why it exists. Keep under 500 lines total.
Move detailed reference material to supporting files in this directory.
</background_information>

<instructions>
What to do, in priority order. Give Claude context and constraints
but let it adapt — avoid rigid step-by-step railroading.
</instructions>

## Trigger
When this skill auto-loads. Define specific phrases, patterns, or
situations that should activate this skill. Without a clear trigger
definition, Claude won't know when to use it.

## Tool Guidance
When to use which tool, ordered by preference.

## Output Description
Format, length, tone expectations for the skill's output.

## Gotchas
<!-- THIS IS THE MOST IMPORTANT SECTION -->
<!-- Test the skill immediately. Run your first task and brief based -->
<!-- on what Claude gets wrong. Every miss becomes a gotcha. -->
<!-- The more gotchas, the better the skill performs. -->
<!-- Format: what went wrong → what to do instead -->

None yet. Add gotchas as they're discovered during use.

## References
See supporting files in this directory for examples, templates, and
scripts. Claude loads these via progressive disclosure only when needed.
One reference depth only — no chains (a.md → b.md → c.md).
Add a table of contents to any reference file over 100 lines.
