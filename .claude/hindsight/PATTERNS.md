# Hindsight — Behavioral Patterns

This file captures behavioral patterns extracted from previous sessions.
Unlike memory (what happened), hindsight is about HOW Claude should behave
based on what worked and what didn't.

This is Layer 4 of the memory architecture. It changes how Claude responds,
not just what it remembers.

## Format

Each pattern follows this structure:

```
### [Pattern Name]
**Trigger:** When this situation occurs...
**Behavior:** Claude should...
**Learned From:** Session where this was discovered
**Confidence:** Low / Medium / High
```

## Patterns

### Exhaustion Loop Detection
**Trigger:** When Claude has made multiple attempts at the same goal without meaningful progress — the same errors keep appearing, or each new approach fails in a similar way.
**Behavior:** Stop. Declare explicitly: "I am in a loop. Here is what I have tried and why each failed." Re-plan with the user rather than silently shifting to increasingly lateral strategies. Never escalate to unorthodox approaches without declaring the loop first.
**Learned From:** Anthropic BrowseComp eval-awareness post-mortem — Claude spent 40.5M tokens in an uncontrolled search loop without declaring it was stuck.
**Confidence:** High (verified against official Anthropic engineering research)

### Structural Problem Analysis
**Trigger:** When legitimate approaches are exhausted and the problem feels unsolvable — nothing is working despite reasonable effort.
**Behavior:** Shift attention from "searching for the answer" to "analyzing why I can't find the answer." Is the spec ambiguous? Is a dependency missing? Is the goal itself malformed? Is there a prerequisite that hasn't been met? Surface this analysis explicitly to the user before trying lateral approaches. The problem structure often reveals the actual blocker.
**Learned From:** Anthropic BrowseComp post-mortem — Claude's shift to structural analysis was the right instinct, just misdirected.
**Confidence:** High (verified against official Anthropic engineering research)

### Compact Agent Output
**Trigger:** When returning results to a parent conversation or coordinator.
**Behavior:** Return max 1,500 tokens. Include only: verdict, summary, failures/findings, and artifact list. Never return passing test logs, full file contents, or raw tool output. The parent conversation's context window is finite — every excess token returned consumes budget that could be used for actual work.
**Learned From:** Anthropic context engineering blog — "Sub-agents return condensed summaries (1,000-2,000 tokens)" as a stated engineering principle.
**Confidence:** High (verified against official Anthropic engineering blog)

### File Ownership in Parallel Work
**Trigger:** When multiple agents or teammates are working in parallel on the same codebase.
**Behavior:** Each agent must own a distinct set of files/directories. State the ownership boundary explicitly in the delegation prompt: "You own only X. Do not modify anything outside that scope." Two agents editing the same file causes overwrites.
**Learned From:** Anthropic C Compiler teams blog + Agent Teams documentation.
**Confidence:** High (verified against official Anthropic docs)
