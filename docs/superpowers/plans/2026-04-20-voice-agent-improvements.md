# Voice Agent Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Gemini a real chief of staff — answers simple questions directly, delegates complex work as missions, briefs you when you arrive, interrupts for urgent events, and has full tool parity with Telegram.

**Architecture:** Update the voice agent's system prompt for intelligent routing (answer vs delegate), add ~12 new tools to `tools.py` (web search, GitHub, GHL, Telegram push, mission lifecycle), create a Telegram notification API endpoint, enhance the greeting with a proactive briefing, and add a background event monitor for urgent interrupts.

**Tech Stack:** Python (livekit-agents), aiohttp, Tavily API, GitHub API, Next.js API routes

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `livekit-agent/tools.py` | Modify | Add 12 new tools |
| `livekit-agent/agent.py` | Modify | Update system prompt, briefing, event monitor |
| `livekit-agent/.env` | Modify | Add TAVILY_API_KEY, GITHUB_TOKEN |
| `apps/web/src/app/api/notify/telegram/route.ts` | Create | POST endpoint to send Telegram message |

---

### Task 1: Telegram Notification API Endpoint

**Files:**
- Create: `apps/web/src/app/api/notify/telegram/route.ts`

- [ ] **Step 1: Create the directory and route**

```typescript
// apps/web/src/app/api/notify/telegram/route.ts
import { NextRequest } from 'next/server'
import { logger } from '@blade/shared'
import { requireAuth, unauthorizedResponse } from '@/lib/auth'

export const runtime = 'nodejs'

export async function POST(req: NextRequest): Promise<Response> {
  const auth = requireAuth(req)
  if (!auth.authorized) return unauthorizedResponse(auth.error ?? 'Unauthorized')

  try {
    const body = await req.json()
    const { message } = body as { message?: string }

    if (!message) {
      return Response.json({ success: false, error: 'message is required' }, { status: 400 })
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN
    const chatId = process.env.TELEGRAM_ALLOWED_CHAT_IDS?.split(',')[0]?.trim()

    if (!botToken || !chatId) {
      return Response.json(
        { success: false, error: 'Telegram bot not configured (TELEGRAM_BOT_TOKEN or TELEGRAM_ALLOWED_CHAT_IDS missing)' },
        { status: 500 }
      )
    }

    const telegramRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message.slice(0, 4096),
        parse_mode: 'HTML',
      }),
    })

    if (!telegramRes.ok) {
      const errorText = await telegramRes.text()
      logger.error('notify', `Telegram send failed: ${errorText.slice(0, 200)}`)
      return Response.json({ success: false, error: 'Telegram API error' }, { status: 502 })
    }

    return Response.json({ success: true })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to send notification'
    logger.error('notify', `telegram error: ${msg}`)
    return Response.json({ success: false, error: msg }, { status: 500 })
  }
}
```

- [ ] **Step 2: Verify file exists**

Run: `ls apps/web/src/app/api/notify/telegram/route.ts`
Expected: File exists

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/api/notify/telegram/route.ts
git commit -m "feat(api): add POST /api/notify/telegram endpoint"
```

---

### Task 2: Add New Voice Tools — Web Search, GitHub, GHL

**Files:**
- Modify: `livekit-agent/tools.py`

- [ ] **Step 1: Add web search tool**

Add after the Meta Ads section, before `ALL_TOOLS`:

```python
# ── Web Search ───────────────────────────────────────────

TAVILY_API_KEY = os.getenv("TAVILY_API_KEY", "")


@function_tool(
    name="web_search",
    description="Search the web for current information. Use when the user asks about recent events, news, or anything that requires up-to-date data.",
)
async def web_search(
    query: Annotated[str, "The search query"],
    max_results: Annotated[int, "Number of results to return, default 5"] = 5,
) -> str:
    if not TAVILY_API_KEY:
        # Fall back to backend web search
        result = await _api("GET", f"/api/search?q={query}&limit={max_results}")
        if result.get("success"):
            items = result.get("data", [])
            if not items:
                return f"No results for '{query}'."
            lines = [f"- {r.get('title', '')}: {r.get('snippet', '')[:150]}" for r in items[:max_results]]
            return f"{len(lines)} results for '{query}':\n" + "\n".join(lines)
        return f"Search failed: {result.get('error', 'unknown')}"

    async with aiohttp.ClientSession() as session:
        async with session.post(
            "https://api.tavily.com/search",
            json={"api_key": TAVILY_API_KEY, "query": query, "max_results": max_results},
        ) as resp:
            data = await resp.json()

    results = data.get("results", [])
    if not results:
        return f"No results for '{query}'."

    lines = []
    for r in results[:max_results]:
        title = r.get("title", "")
        snippet = r.get("content", "")[:150]
        url = r.get("url", "")
        lines.append(f"- {title}: {snippet} ({url})")

    return f"{len(lines)} results for '{query}':\n" + "\n".join(lines)
```

- [ ] **Step 2: Add GitHub tools**

```python
# ── GitHub ───────────────────────────────────────────────

GITHUB_TOKEN = os.getenv("GITHUB_TOKEN", "")


async def _github_get(path: str) -> dict | list:
    """Make a request to the GitHub API."""
    if not GITHUB_TOKEN:
        return {"error": "GITHUB_TOKEN not configured"}
    url = f"https://api.github.com{path}"
    async with aiohttp.ClientSession() as session:
        headers = {
            "Authorization": f"Bearer {GITHUB_TOKEN}",
            "Accept": "application/vnd.github.v3+json",
        }
        async with session.get(url, headers=headers) as resp:
            try:
                return await resp.json()
            except Exception:
                text = await resp.text()
                return {"error": f"HTTP {resp.status}: {text[:200]}"}


@function_tool(
    name="github_list_issues",
    description="List open issues for a GitHub repository. Use when the user asks about issues, bugs, or open tickets.",
)
async def github_list_issues(
    repo: Annotated[str, "Repository in owner/repo format, e.g. 'user/blade'"],
    state: Annotated[str, "Filter: open, closed, or all. Default: open"] = "open",
) -> str:
    result = await _github_get(f"/repos/{repo}/issues?state={state}&per_page=15")
    if isinstance(result, dict) and "error" in result:
        return f"Could not fetch issues: {result['error']}"

    issues = [i for i in result if "pull_request" not in i]  # Exclude PRs
    if not issues:
        return f"No {state} issues for {repo}."

    lines = []
    for i in issues[:15]:
        labels = ", ".join(l["name"] for l in i.get("labels", []))
        label_str = f" [{labels}]" if labels else ""
        lines.append(f"- #{i['number']}: {i['title']}{label_str}")

    return f"{len(issues)} {state} issues for {repo}:\n" + "\n".join(lines)


@function_tool(
    name="github_get_pr",
    description="Get details about a specific pull request. Use when the user asks about a PR by number.",
)
async def github_get_pr(
    repo: Annotated[str, "Repository in owner/repo format"],
    pr_number: Annotated[int, "The PR number"],
) -> str:
    result = await _github_get(f"/repos/{repo}/pulls/{pr_number}")
    if isinstance(result, dict) and "error" in result:
        return f"Could not fetch PR: {result['error']}"

    pr = result
    state = pr.get("state", "unknown")
    title = pr.get("title", "")
    user = pr.get("user", {}).get("login", "unknown")
    additions = pr.get("additions", 0)
    deletions = pr.get("deletions", 0)
    mergeable = pr.get("mergeable_state", "unknown")
    body = (pr.get("body") or "")[:300]

    return (
        f"PR #{pr_number}: {title}\n"
        f"Author: {user} | State: {state} | Mergeable: {mergeable}\n"
        f"+{additions} -{deletions} lines\n"
        f"Description: {body}"
    )
```

- [ ] **Step 3: Add GHL lead tools**

```python
# ── GHL / Leads ──────────────────────────────────────────


@function_tool(
    name="ghl_lead_events",
    description="Get recent lead activity — messages, appointments, status changes. Use when the user asks about leads or what's happening with clients.",
)
async def ghl_lead_events(
    days: Annotated[int, "Number of days to look back, default 7"] = 7,
) -> str:
    result = await _api("GET", f"/api/leads/events?days={days}&limit=15")
    if not result.get("success"):
        return f"Could not fetch lead events: {result.get('error', 'unknown')}"

    events = result.get("data", [])
    if not events:
        return f"No lead events in the last {days} days."

    lines = []
    for e in events[:15]:
        event_type = e.get("type", "event")
        contact = e.get("contactName", "Unknown")
        summary = e.get("summary", "")[:100]
        lines.append(f"- [{event_type}] {contact}: {summary}")

    return f"{len(events)} lead events (last {days} days):\n" + "\n".join(lines)


@function_tool(
    name="ghl_funnel_analysis",
    description="Get lead funnel analysis — how leads progress through pipeline stages. Use when the user asks about conversion rates or funnel performance.",
)
async def ghl_funnel_analysis(
    days: Annotated[int, "Number of days to analyze, default 30"] = 30,
) -> str:
    result = await _api("GET", f"/api/leads/funnel?days={days}")
    if not result.get("success"):
        return f"Could not fetch funnel data: {result.get('error', 'unknown')}"

    data = result.get("data", {})
    stages = data.get("stages", [])
    if not stages:
        return "No funnel data available."

    lines = []
    for s in stages:
        name = s.get("name", "Unknown")
        count = s.get("count", 0)
        pct = s.get("conversionRate", 0)
        lines.append(f"- {name}: {count} leads ({pct:.1f}% conversion)")

    return f"Funnel analysis (last {days} days):\n" + "\n".join(lines)


@function_tool(
    name="ghl_intro_response_rate",
    description="Get intro message response rates — how many leads replied to the first outbound message. Use when the user asks about outreach effectiveness.",
)
async def ghl_intro_response_rate(
    days: Annotated[int, "Number of days to look back, default 30"] = 30,
) -> str:
    result = await _api("GET", f"/api/leads/intro-rate?days={days}")
    if not result.get("success"):
        return f"Could not fetch response rates: {result.get('error', 'unknown')}"

    data = result.get("data", {})
    total = data.get("totalLeads", 0)
    responded = data.get("responded", 0)
    rate = data.get("responseRate", 0)

    return (
        f"Intro response rate (last {days} days):\n"
        f"Total leads contacted: {total}\n"
        f"Responded: {responded}\n"
        f"Response rate: {rate:.1f}%"
    )
```

- [ ] **Step 4: Commit new tools**

```bash
git add livekit-agent/tools.py
git commit -m "feat(voice): add web search, GitHub, and GHL tools"
```

---

### Task 3: Add Mission Lifecycle and Telegram Tools

**Files:**
- Modify: `livekit-agent/tools.py`

- [ ] **Step 1: Add send_to_telegram tool**

Add after the GHL section:

```python
# ── Telegram Push ────────────────────────────────────────


@function_tool(
    name="send_to_telegram",
    description="Send content to the user's Telegram chat. Use for long lists, code, "
                "detailed results, or anything better read than heard. Also use when "
                "a tool returns more than 5 items — speak a summary and send the full list here.",
)
async def send_to_telegram(
    message: Annotated[str, "The content to send to Telegram"],
) -> str:
    result = await _api("POST", "/api/notify/telegram", {"message": message})
    if result.get("success"):
        return "Sent to Telegram."
    return f"Failed to send: {result.get('error', 'unknown')}"
```

- [ ] **Step 2: Add mission lifecycle tools**

```python
# ── Mission Lifecycle ────────────────────────────────────


@function_tool(
    name="approve_mission",
    description="Approve a completed mission that is pending review. Use when the user says 'approve' or 'looks good' about a mission.",
)
async def approve_mission(
    mission_id: Annotated[str, "The mission ID to approve. Use list_missions with status='pending_review' to find IDs."],
) -> str:
    result = await _api("POST", f"/api/missions/{mission_id}/approve")
    if result.get("success"):
        return "Mission approved."
    return f"Could not approve: {result.get('error', 'unknown')}"


@function_tool(
    name="reject_mission",
    description="Reject a completed mission and send it back with feedback. Use when the user is not satisfied with a mission result.",
)
async def reject_mission(
    mission_id: Annotated[str, "The mission ID to reject"],
    reason: Annotated[str, "Why the mission is being rejected — what should be different"],
) -> str:
    result = await _api("POST", f"/api/missions/{mission_id}/reject", {"reason": reason})
    if result.get("success"):
        return f"Mission rejected. Reason sent: {reason}"
    return f"Could not reject: {result.get('error', 'unknown')}"


@function_tool(
    name="respond_to_mission",
    description="Answer an employee's clarification question on an active mission. Use when an employee is waiting for input and the user provides the answer.",
)
async def respond_to_mission(
    mission_id: Annotated[str, "The mission ID to respond to. Use list_missions with status='awaiting_input' to find IDs."],
    response: Annotated[str, "The answer to the employee's question"],
) -> str:
    result = await _api("POST", f"/api/missions/{mission_id}/respond", {"response": response})
    if result.get("success"):
        return "Response sent. The employee will resume work."
    return f"Could not respond: {result.get('error', 'unknown')}"
```

- [ ] **Step 3: Update ALL_TOOLS list**

Replace the existing `ALL_TOOLS` at the bottom of `tools.py`:

```python
# ── All tools list for agent registration ─────────────────

ALL_TOOLS = [
    # Missions
    create_mission,
    list_missions,
    get_mission_result,
    # Mission lifecycle
    approve_mission,
    reject_mission,
    respond_to_mission,
    # Memory
    search_memory,
    save_memory,
    get_memory_stats,
    # Team
    get_team_status,
    # Costs
    get_costs,
    # Activity
    get_recent_activity,
    # Schedules
    list_schedules,
    # Meta Ads
    meta_list_accounts,
    meta_account_performance,
    meta_campaign_performance,
    # Web search
    web_search,
    # GitHub
    github_list_issues,
    github_get_pr,
    # GHL / Leads
    ghl_lead_events,
    ghl_funnel_analysis,
    ghl_intro_response_rate,
    # Telegram push
    send_to_telegram,
]
```

- [ ] **Step 4: Commit**

```bash
git add livekit-agent/tools.py
git commit -m "feat(voice): add mission lifecycle, Telegram push, and complete tool list"
```

---

### Task 4: Update System Prompt for Intelligent Routing

**Files:**
- Modify: `livekit-agent/agent.py`

- [ ] **Step 1: Update the chief-of-staff instructions**

In `agent.py`, replace the `"chief-of-staff"` entry's `"instructions"` value with:

```python
    "chief-of-staff": {
        "name": "Gemini",
        "instructions": (
            "You are Gemini, the chief of staff for Dr. Emeka's Blade Command Center — "
            "an AI super agent platform that replaces entire employee teams. "
            "You are the voice interface. Confident, direct, no filler. Short sentences. "
            "\n\n"
            "ROUTING — ANSWER vs DELEGATE:\n"
            "When the user asks for information you can look up with your tools, answer directly. "
            "This includes: ad performance, costs, team status, memory search, web search, "
            "GitHub issues, lead data, schedules. Use the appropriate tool and speak the result.\n"
            "When the user asks for work that requires research, creation, writing, or multi-step "
            "execution, create a mission using create_mission and delegate to the right specialist. "
            "Tell the user which specialist is handling it and what they will deliver. "
            "Specialists: Nova (research), Echo (comms), Muse (content), Forge (ops/code).\n\n"
            "VOICE OUTPUT RULES:\n"
            "When a tool returns more than 5 items (list entries, search results, issues, etc.), "
            "speak a brief summary — the count and top 3 highlights — then automatically use "
            "send_to_telegram to send the full list. Say 'I have sent the full list to your Telegram.'\n"
            "Keep all spoken responses under 30 seconds. Be concise.\n\n"
            "MISSION MANAGEMENT:\n"
            "You can approve, reject, or respond to missions by voice. When the user says "
            "'approve that mission' or 'looks good', use approve_mission. When they give feedback "
            "like 'reject it, focus on US only', use reject_mission with the reason. When an "
            "employee is waiting for input, use respond_to_mission.\n\n"
            "WHAT YOU CAN DO:\n"
            "Search the web. Check GitHub issues and PRs. Pull Meta Ads performance. "
            "Query lead data and funnel metrics. Search and save to memory. "
            "Track costs and system activity. Manage the full mission lifecycle. "
            "Send anything to the user's Telegram for reading.\n\n"
            "The user is Dr. Emeka Ajufo, founder and operator of Blade. "
            "Do not use emojis, asterisks, markdown, or other special characters."
        ),
    },
```

- [ ] **Step 2: Verify file is valid Python**

Run: `cd /Users/emekaajufo/Blade\ Super\ Agent/livekit-agent && python3 -c "import ast; ast.parse(open('agent.py').read()); print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add livekit-agent/agent.py
git commit -m "feat(voice): update system prompt for intelligent routing and voice output rules"
```

---

### Task 5: Proactive Briefing on Connect

**Files:**
- Modify: `livekit-agent/agent.py`

- [ ] **Step 1: Update the generate_reply greeting**

In `agent.py`, replace the existing greeting `generate_reply` call:

```python
    # Greet the user with a short opening line
    await session.generate_reply(
        instructions=f"Greet the user briefly. You are {config['name']}. Keep it to one short sentence."
    )
```

With:

```python
    # Proactive briefing: check system status and brief the user
    await session.generate_reply(
        instructions=(
            f"You are {config['name']}. Give a brief status update. "
            "Use get_recent_activity and list_missions to check what happened recently. "
            "Mention: any missions completed, missions needing your approval, any failures, "
            "and today's cost if notable. Keep it under 15 seconds of speech — just the highlights. "
            "If nothing notable happened, just greet the user with one short sentence."
        )
    )
```

- [ ] **Step 2: Verify file is valid Python**

Run: `cd /Users/emekaajufo/Blade\ Super\ Agent/livekit-agent && python3 -c "import ast; ast.parse(open('agent.py').read()); print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add livekit-agent/agent.py
git commit -m "feat(voice): proactive briefing on connect — checks missions and activity"
```

---

### Task 6: Real-Time Event Monitor

**Files:**
- Modify: `livekit-agent/agent.py`

- [ ] **Step 1: Add asyncio import**

At the top of `agent.py`, add `import asyncio` after the existing imports (if not already present):

```python
import asyncio
```

- [ ] **Step 2: Add the monitor_events function**

Add before the `entrypoint` function (after the `get_agent_config` function):

```python
async def monitor_events(session: AgentSession, api_func) -> None:
    """Poll for urgent events every 30 seconds during active session."""
    seen_event_ids: set[str] = set()
    urgent_types = {
        "mission_failed",
        "mission_pending_review",
        "mission_awaiting_input",
        "escalation_triggered",
    }

    while True:
        await asyncio.sleep(30)
        try:
            from tools import _api
            result = await _api("GET", "/api/timeline?limit=5")
            events = result.get("data", result.get("events", []))

            for event in events:
                event_id = str(event.get("id", ""))
                if not event_id or event_id in seen_event_ids:
                    continue
                seen_event_ids.add(event_id)

                event_type = event.get("eventType", event.get("type", ""))
                if event_type in urgent_types:
                    summary = event.get("summary", event.get("description", "Unknown event"))
                    await session.generate_reply(
                        instructions=(
                            f"Alert the user about this urgent event: {summary}. "
                            "Keep it to one sentence. Be direct."
                        )
                    )
        except Exception as e:
            logger.warning(f"Event monitor error: {e}")

    # Keep seen set bounded
    if len(seen_event_ids) > 200:
        seen_event_ids.clear()
```

- [ ] **Step 3: Start the monitor after session.start()**

In the `entrypoint` function, add after the `session.start()` call and before the `generate_reply` call:

```python
    # Start background event monitor for urgent interrupts
    monitor_task = asyncio.create_task(monitor_events(session, None))

    # Cancel monitor when room disconnects
    @ctx.room.on("disconnected")
    def on_disconnect():
        monitor_task.cancel()
```

- [ ] **Step 4: Verify file is valid Python**

Run: `cd /Users/emekaajufo/Blade\ Super\ Agent/livekit-agent && python3 -c "import ast; ast.parse(open('agent.py').read()); print('OK')"`
Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add livekit-agent/agent.py
git commit -m "feat(voice): add real-time event monitor for urgent interrupts"
```

---

### Task 7: Add Missing Env Vars

**Files:**
- Modify: `livekit-agent/.env`

- [ ] **Step 1: Copy API keys from root .env**

Read the root `.env` file and copy the TAVILY and GITHUB keys to `livekit-agent/.env`:

Add these lines to the end of `livekit-agent/.env`:

```
TAVILY_API_KEY=<value from root .env>
GITHUB_TOKEN=<value from root .env>
```

Get the actual values:
```bash
grep "^TAVILY_API_KEY=" /Users/emekaajufo/Blade\ Super\ Agent/.env
grep "^GITHUB_TOKEN=" /Users/emekaajufo/Blade\ Super\ Agent/.env
```

Then append them to the agent's `.env`.

- [ ] **Step 2: Verify all required keys are present**

Run: `grep -c "=" /Users/emekaajufo/Blade\ Super\ Agent/livekit-agent/.env`
Expected: At least 10 keys (LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET, GOOGLE_API_KEY, BLADE_API_URL, BLADE_API_TOKEN, CARTESIA_API_KEY, META_USER_TOKEN, TAVILY_API_KEY, GITHUB_TOKEN)

- [ ] **Step 3: Do NOT commit .env files**

`.env` files should not be committed to git.

---

### Task 8: Restart Agent and Verify

- [ ] **Step 1: Kill existing agent**

```bash
pkill -f "agent.py dev" 2>/dev/null
```

- [ ] **Step 2: Start agent with new tools**

```bash
cd /Users/emekaajufo/Blade\ Super\ Agent/livekit-agent && source .venv/bin/activate && python agent.py dev > /tmp/blade-agent.log 2>&1 &
sleep 4 && tail -10 /tmp/blade-agent.log
```

Expected: Agent registers successfully, all plugins loaded (cartesia, google, silero)

- [ ] **Step 3: Test tool count**

Open the command center at http://localhost:5174 and verify:
- Gemini greets with a briefing (mentions recent activity/missions)
- Ask "How are my ads doing?" — should answer directly
- Ask "Search the web for latest on hormone optimization" — should use web_search
- Ask "Research competitor pricing for IV Wellness" — should create a mission
- Ask "Send that to Telegram" — should push to Telegram

- [ ] **Step 4: Final commit**

```bash
cd /Users/emekaajufo/Blade\ Super\ Agent
git add livekit-agent/agent.py livekit-agent/tools.py apps/web/src/app/api/notify/telegram/route.ts
git commit -m "feat(voice): complete voice agent improvements — 25 tools, briefing, event monitor, routing"
```
