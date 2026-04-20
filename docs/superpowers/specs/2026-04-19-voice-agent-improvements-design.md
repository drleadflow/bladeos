# Voice Agent Improvements — Design Spec

**Date:** 2026-04-19
**Status:** Draft
**Scope:** Part 2 of 4 — Command Center upgrade series
**Depends on:** Part 1 (Mission Execution Engine)

## Problem

The voice agent (Gemini) can talk and call 13 tools, but it's disconnected from the mission lifecycle, has no awareness of system events, and lacks most of the tools available to the Telegram agent. It can't delegate real work, can't brief you on what happened, and can't push content to where you can actually read it.

## Goal

Make Gemini a real chief of staff — answers simple questions directly, delegates complex work as missions, briefs you when you arrive, interrupts for urgent events, and has full tool parity with Telegram.

## Design

### 1. Intelligent Routing (Answer vs Delegate)

Gemini decides per-request whether to handle it directly or dispatch a mission.

**Direct execution (tool call, speak result):**
- Data lookups: ad performance, costs, team status, memory search
- Quick queries: "how many open issues?", "what's my spend today?"
- System commands: "mute Nova", "pause that mission"

**Dispatch as mission:**
- Research tasks: "research competitor pricing for IV Wellness"
- Content creation: "write a blog post about hormone optimization"
- Multi-step ops: "deploy the latest build and run tests"
- Anything that would take an employee more than 30 seconds

**Implementation:** No hardcoded rules. The routing logic lives in Gemini's system prompt instructions. The `create_mission` tool description tells Gemini when to use it vs answering directly. Add a line to the chief-of-staff persona:

```
When the user asks for information you can look up with your tools, answer directly.
When the user asks for work that requires research, creation, or multi-step execution,
create a mission and delegate to the right specialist. Tell the user which specialist
is handling it and what they'll deliver.
```

### 2. Full Tool Parity

Add all core tools to the voice agent's `tools.py`. New tools to add:

| Tool | Source | Purpose |
|------|--------|---------|
| `web_search` | New implementation | Search the web via Tavily/SerpAPI |
| `github_list_issues` | New implementation | List open issues for a repo |
| `github_get_pr` | New implementation | Get PR details |
| `ghl_lead_events` | New implementation | Recent lead activity |
| `ghl_funnel_analysis` | New implementation | Lead funnel metrics |
| `ghl_intro_response_rate` | New implementation | Intro message response rates |
| `send_to_telegram` | New tool | Push content to user's Telegram chat |
| `approve_mission` | New tool | Approve a pending_review mission by voice |
| `reject_mission` | New tool | Reject a pending_review mission by voice |
| `respond_to_mission` | New tool | Answer an employee's clarification question |

**Implementation approach:** Each tool in `tools.py` calls the corresponding backend API endpoint (same pattern as existing tools). The backend already has these endpoints; the voice agent just needs the tool wrappers.

**Total voice tools after upgrade:** ~25 tools

### 3. Voice-Optimized Output

**Threshold rule:** Results with 5 or fewer items are spoken in full. Over 5 items, Gemini speaks a summary and auto-sends the full list to Telegram.

**Implementation:** Add to the system prompt:

```
When a tool returns more than 5 items (list entries, search results, issues, etc.),
speak a brief summary (count, top 3 highlights) and automatically use the
send_to_telegram tool to send the full list. Say "I've sent the full list to
your Telegram."
```

The `send_to_telegram` tool:

```python
@function_tool(
    name="send_to_telegram",
    description="Send content to the user's Telegram chat. Use for long lists, code, "
                "detailed results, or anything better read than heard.",
)
async def send_to_telegram(
    message: Annotated[str, "The content to send"],
) -> str:
    result = await _api("POST", "/api/notify/telegram", {"message": message})
    if result.get("success"):
        return "Sent to Telegram."
    return f"Failed to send: {result.get('error', 'unknown')}"
```

**Backend requirement:** A new `POST /api/notify/telegram` endpoint that sends a message to the user's Telegram chat. Uses the existing bot's `sendMessage` function.

### 4. Proactive Briefing on Connect

When a user connects to the command center and the voice agent starts, Gemini delivers a short briefing.

**Trigger:** The `generate_reply` call that currently says "Greet the user briefly" is enhanced:

```python
await session.generate_reply(
    instructions=(
        f"You are {config['name']}. Give a brief status update: "
        "use the get_recent_activity and list_missions tools to check what happened "
        "since the user was last here. Mention: missions completed, missions needing "
        "approval, any failures, today's cost. Keep it under 15 seconds of speech. "
        "If nothing notable happened, just greet them briefly."
    )
)
```

**No new infrastructure needed.** Gemini calls existing tools during the greeting to gather context, then speaks a natural briefing.

### 5. Real-Time Urgent Interrupts

During an active session, Gemini monitors for urgent events and speaks up when something needs attention.

**Events that trigger interrupts:**
- Mission failed
- Mission needs approval (priority 6-10 completed)
- Employee asking for clarification (awaiting_input for 5+ minutes)
- Escalation event triggered

**Implementation:** A background polling task inside the agent session:

```python
async def monitor_events(session: AgentSession):
    """Poll for urgent events every 30 seconds during active session."""
    seen_events: set[str] = set()
    while True:
        await asyncio.sleep(30)
        events = await _api("GET", "/api/timeline?limit=5")
        for event in events.get("data", []):
            event_id = event.get("id")
            if event_id in seen_events:
                continue
            seen_events.add(event_id)
            event_type = event.get("eventType", "")
            if event_type in ("mission_failed", "mission_pending_review",
                              "mission_awaiting_input", "escalation_triggered"):
                await session.generate_reply(
                    instructions=f"Alert the user about this event: {event.get('summary')}. "
                                 "Keep it brief — one sentence."
                )
```

Started as an `asyncio.create_task()` after `session.start()`. Cancelled on disconnect.

### 6. Mission Lifecycle Voice Commands

Gemini can manage missions entirely by voice:

- "What missions are pending my review?" → calls `list_missions(status='pending_review')`
- "Approve the research mission" → calls `approve_mission(id)`
- "Reject it, tell Nova to focus on US competitors only" → calls `reject_mission(id, reason)`
- "Nova is asking about competitors — tell her to focus on the top 5 by revenue" → calls `respond_to_mission(id, response)`

These work through the new tools added in section 2, which call the API endpoints created in Part 1.

## Files to Create/Modify

**Create:**
- `apps/web/src/app/api/notify/telegram/route.ts` — Send message to user's Telegram
- `apps/web/src/app/api/missions/[id]/approve/route.ts` — Already created in Part 1
- `apps/web/src/app/api/missions/[id]/reject/route.ts` — Already created in Part 1
- `apps/web/src/app/api/missions/[id]/respond/route.ts` — Already created in Part 1

**Modify:**
- `livekit-agent/tools.py` — Add ~12 new tools (web search, GitHub, GHL, telegram, mission lifecycle)
- `livekit-agent/agent.py` — Update system prompt for routing behavior, enhance greeting with briefing, add event monitor task
- `livekit-agent/.env` — Add any missing API keys (TAVILY_API_KEY, GITHUB_TOKEN if not present)

## Out of Scope

- Voice agent switching between employees mid-conversation (always Gemini's voice)
- Streaming mission progress to voice in real-time
- Voice-triggered file uploads
- Multi-turn clarification dialogues (Gemini asks one question, user answers, done)

## Success Criteria

1. "How are my ads doing?" → Gemini answers directly with Meta Ads data in <5 seconds
2. "Research competitor pricing for IV Wellness" → Gemini creates mission, dispatches to Nova, confirms verbally
3. On first connect each day → Gemini briefs you on overnight activity in <15 seconds
4. When a mission fails during session → Gemini interrupts with a one-sentence alert
5. "Send that to Telegram" → Full result lands in Telegram chat
6. Long tool results (>5 items) auto-summarize for voice + auto-send full list to Telegram
7. "Approve the research mission" → Mission marked done via voice command
