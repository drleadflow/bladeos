"""
Blade Command — Voice Agent Tools

These tools give Gemini access to the Blade backend API,
allowing voice-driven mission creation, memory recall,
agent status checks, and more.
"""

import os
import json
import logging
from typing import Annotated

import aiohttp
from livekit.agents import function_tool, RunContext

logger = logging.getLogger("blade-tools")

API_URL = os.getenv("BLADE_API_URL", "http://localhost:3000")
API_TOKEN = os.getenv("BLADE_API_TOKEN", "")


async def _api(method: str, path: str, body: dict | None = None) -> dict:
    """Make a request to the Blade backend API."""
    url = f"{API_URL}{path}"
    async with aiohttp.ClientSession() as session:
        headers: dict[str, str] = {"Content-Type": "application/json"}
        if API_TOKEN:
            headers["Authorization"] = f"Bearer {API_TOKEN}"
        kwargs: dict = {"headers": headers}
        if body:
            kwargs["json"] = body
        async with session.request(method, url, **kwargs) as resp:
            try:
                return await resp.json()
            except Exception:
                text = await resp.text()
                return {"success": False, "error": f"HTTP {resp.status}: {text[:200]}"}


# ── Missions ──────────────────────────────────────────────

@function_tool(
    name="create_mission",
    description="Create a new mission/task and delegate it to a specialist agent. Use this when the user asks you to do something that requires work — research, outreach, content creation, ops tasks, etc.",
)
async def create_mission(
    title: Annotated[str, "Short title for the mission"],
    description: Annotated[str, "Detailed description of what needs to be done"],
    domain: Annotated[str, "Domain: business, health, wealth, relationships, or spirituality"] = "business",
    priority: Annotated[int, "Priority 1-10, default 5. Use 8-10 for urgent tasks."] = 5,
    agent: Annotated[str | None, "Force assign to: research, comms, content, or ops. Leave empty for auto-routing."] = None,
) -> str:
    body: dict = {
        "title": title,
        "description": description,
        "domain": domain,
        "priority": priority,
    }
    if agent:
        body["assigned_agent"] = agent.upper()

    result = await _api("POST", "/api/missions", body)
    if result.get("success"):
        mission_id = result.get("data", {}).get("id", "unknown")
        return f"Mission created: '{title}' (ID: {mission_id}). It's been queued for processing."
    return f"Failed to create mission: {result.get('error', 'unknown error')}"


@function_tool(
    name="list_missions",
    description="List current missions. Use this when the user asks what's in progress, what's queued, or what tasks are active.",
)
async def list_missions(
    status: Annotated[str | None, "Filter by status: queued, assigned, in_progress, completed, failed. Leave empty for all active."] = None,
) -> str:
    path = "/api/missions"
    if status:
        path += f"?status={status}"

    result = await _api("GET", path)
    if not result.get("success"):
        return f"Failed to fetch missions: {result.get('error', 'unknown')}"

    missions = result.get("data", [])
    if not missions:
        return "No missions found." if status else "No active missions right now."

    lines = []
    for m in missions[:10]:
        agent_name = m.get("assigned_agent", "unassigned")
        lines.append(f"- {m['title']} ({m['status']}, assigned to {agent_name}, priority {m.get('priority', 5)})")

    total = len(missions)
    summary = f"{total} mission{'s' if total != 1 else ''} found"
    if total > 10:
        summary += f" (showing first 10)"
    return f"{summary}:\n" + "\n".join(lines)


@function_tool(
    name="get_mission_result",
    description="Get the result/output of a completed mission by its ID.",
)
async def get_mission_result(
    mission_id: Annotated[str, "The mission ID to look up"],
) -> str:
    result = await _api("GET", f"/api/missions/{mission_id}")
    if not result.get("success"):
        return f"Could not find mission {mission_id}."

    mission = result.get("data", {})
    status = mission.get("status", "unknown")
    output = mission.get("output")
    error = mission.get("error")

    if status == "completed" and output:
        return f"Mission '{mission['title']}' completed. Result: {output[:500]}"
    elif status == "failed" and error:
        return f"Mission '{mission['title']}' failed: {error[:300]}"
    else:
        return f"Mission '{mission['title']}' is currently {status}. No output yet."


# ── Memory ────────────────────────────────────────────────

@function_tool(
    name="search_memory",
    description="Search the memory/knowledge base. Use this when the user asks 'do you remember', 'what do we know about', or references past conversations or decisions.",
)
async def search_memory(
    query: Annotated[str, "What to search for in memory"],
) -> str:
    result = await _api("GET", f"/api/memory/search?q={query}")
    if not result.get("success"):
        return "Could not search memory right now."

    memories = result.get("data", [])
    if not memories:
        return f"No memories found matching '{query}'."

    lines = []
    for m in memories[:5]:
        summary = m.get("summary", m.get("raw_text", ""))[:150]
        importance = m.get("importance", 0)
        lines.append(f"- {summary} (importance: {importance:.1f})")

    return f"Found {len(memories)} relevant memories:\n" + "\n".join(lines)


@function_tool(
    name="save_memory",
    description="Save an important fact, decision, or piece of information to long-term memory. Use when the user tells you something they want remembered.",
)
async def save_memory(
    content: Annotated[str, "The fact or information to remember"],
    domain: Annotated[str, "Domain: business, health, wealth, relationships, or spirituality"] = "business",
) -> str:
    result = await _api("POST", "/api/memory", {
        "content": content,
        "domain": domain,
    })
    if result.get("success"):
        return "Got it. Saved to memory."
    return f"Could not save to memory: {result.get('error', 'unknown')}"


@function_tool(
    name="get_memory_stats",
    description="Get memory system stats — how many memories stored, average confidence, etc.",
)
async def get_memory_stats() -> str:
    result = await _api("GET", "/api/memory/stats")
    if not result.get("success"):
        return "Could not fetch memory stats."

    data = result.get("data", {})
    total = data.get("totalMemories", 0)
    avg_conf = data.get("avgConfidence", 0)
    return f"Memory bank: {total} memories stored, average confidence {avg_conf:.2f}."


# ── Agents / Employees ───────────────────────────────────

@function_tool(
    name="get_team_status",
    description="Check the status of the specialist agents — who's online, who's busy, what they're working on.",
)
async def get_team_status() -> str:
    result = await _api("GET", "/api/employees")
    if not result.get("success"):
        return "Could not fetch team status."

    employees = result.get("data", [])
    if not employees:
        return "No agents registered."

    lines = []
    for e in employees:
        name = e.get("name", e.get("slug", "unknown"))
        status = "online" if e.get("isActive") else "offline"
        current = e.get("currentMission")
        line = f"- {name}: {status}"
        if current:
            line += f" (working on: {current})"
        lines.append(line)

    return f"Team status:\n" + "\n".join(lines)


# ── Costs ─────────────────────────────────────────────────

@function_tool(
    name="get_costs",
    description="Check how much has been spent today on AI operations — API calls, tokens, etc.",
)
async def get_costs(
    period: Annotated[str, "Time period: today, week, or month"] = "today",
) -> str:
    result = await _api("GET", f"/api/costs?period={period}")
    if not result.get("success"):
        return "Could not fetch cost data."

    data = result.get("data", {})
    total = data.get("total", data.get("totalCost", 0))
    return f"Total spend for {period}: ${total:.2f}"


# ── Timeline / Activity ──────────────────────────────────

@function_tool(
    name="get_recent_activity",
    description="Get recent activity and events — what's happened in the system lately.",
)
async def get_recent_activity() -> str:
    result = await _api("GET", "/api/timeline?limit=10")
    if not result.get("success"):
        return "Could not fetch activity timeline."

    events = result.get("data", [])
    if not events:
        return "No recent activity."

    lines = []
    for e in events[:10]:
        event_type = e.get("type", "event")
        summary = e.get("summary", e.get("description", ""))[:100]
        lines.append(f"- [{event_type}] {summary}")

    return f"Recent activity:\n" + "\n".join(lines)


# ── Schedules ─────────────────────────────────────────────

@function_tool(
    name="list_schedules",
    description="List scheduled/recurring tasks — cron jobs that run on a schedule.",
)
async def list_schedules() -> str:
    result = await _api("GET", "/api/schedules")
    if not result.get("success"):
        return "Could not fetch schedules."

    schedules = result.get("data", [])
    if not schedules:
        return "No scheduled tasks."

    lines = []
    for s in schedules[:10]:
        prompt = s.get("prompt", "")[:80]
        cron = s.get("cron_expression", "")
        status = s.get("status", "active")
        lines.append(f"- {prompt} ({cron}, {status})")

    return f"{len(schedules)} scheduled tasks:\n" + "\n".join(lines)


# ── Meta Ads ─────────────────────────────────────────────

META_TOKEN = os.getenv("META_USER_TOKEN", "")
META_GRAPH = "https://graph.facebook.com/v21.0"


async def _meta_get(path: str, params: dict | None = None) -> dict:
    """Make a request to the Meta Graph API."""
    if not META_TOKEN:
        return {"error": "META_USER_TOKEN not configured"}
    url = f"{META_GRAPH}{path}"
    all_params = {"access_token": META_TOKEN, **(params or {})}
    async with aiohttp.ClientSession() as session:
        async with session.get(url, params=all_params) as resp:
            try:
                return await resp.json()
            except Exception:
                text = await resp.text()
                return {"error": f"HTTP {resp.status}: {text[:200]}"}


@function_tool(
    name="meta_list_accounts",
    description="List all Meta/Facebook ad accounts with status and total spend. Use when the user asks about their ad accounts.",
)
async def meta_list_accounts() -> str:
    result = await _meta_get("/me/adaccounts", {
        "fields": "id,name,account_status,currency,amount_spent",
    })
    if "error" in result:
        return f"Could not fetch ad accounts: {result['error']}"

    status_map = {1: "Active", 2: "Disabled", 3: "Unsettled", 7: "Pending Review", 9: "Grace Period"}
    accounts = result.get("data", [])
    if not accounts:
        return "No ad accounts found."

    lines = []
    for a in accounts:
        name = a.get("name", "Unknown")
        status = status_map.get(a.get("account_status"), "Unknown")
        spent = int(a.get("amount_spent", 0)) / 100
        lines.append(f"- {name}: {status}, ${spent:,.2f} total spent (ID: {a['id']})")

    return f"{len(accounts)} ad accounts:\n" + "\n".join(lines)


@function_tool(
    name="meta_account_performance",
    description="Get ad performance metrics — spend, impressions, clicks, CTR, CPC, leads, CPL, purchases. Use when the user asks how ads are doing, ad performance, ROAS, or CPL.",
)
async def meta_account_performance(
    account_id: Annotated[str, "Ad account ID like act_12345. Use meta_list_accounts first if unknown."],
    date_preset: Annotated[str, "Date range: today, yesterday, last_7d, last_14d, last_30d, this_month, last_month"] = "last_7d",
) -> str:
    result = await _meta_get(f"/{account_id}/insights", {
        "fields": "spend,impressions,clicks,ctr,cpc,actions,cost_per_action_type,reach,frequency",
        "date_preset": date_preset,
    })
    if "error" in result:
        return f"Could not fetch performance: {result['error']}"

    data = result.get("data", [])
    if not data:
        return f"No data for {account_id} in {date_preset}."

    d = data[0]
    actions = d.get("actions", [])
    cost_per = d.get("cost_per_action_type", [])

    def find_action(key: str) -> str:
        return next((a["value"] for a in actions if a["action_type"] == key), "0")

    def find_cost(key: str) -> str:
        val = next((a["value"] for a in cost_per if a["action_type"] == key), None)
        return f"${float(val):.2f}" if val else "N/A"

    spend = float(d.get("spend", 0))
    lines = [
        f"Performance for {date_preset}:",
        f"Spend: ${spend:.2f}",
        f"Impressions: {d.get('impressions', 0)} | Reach: {d.get('reach', 0)}",
        f"Clicks: {d.get('clicks', 0)} | CTR: {float(d.get('ctr', 0)):.2f}% | CPC: ${float(d.get('cpc', 0)):.2f}",
        f"Leads: {find_action('lead')} | CPL: {find_cost('lead')}",
        f"Purchases: {find_action('purchase')} | CPP: {find_cost('purchase')}",
    ]
    return "\n".join(lines)


@function_tool(
    name="meta_campaign_performance",
    description="Break down ad performance by campaign. Shows each campaign with spend, leads, CPL. Use when the user asks which campaigns are performing best or worst.",
)
async def meta_campaign_performance(
    account_id: Annotated[str, "Ad account ID like act_12345"],
    date_preset: Annotated[str, "Date range. Default: last_7d"] = "last_7d",
) -> str:
    result = await _meta_get(f"/{account_id}/insights", {
        "fields": "campaign_name,spend,impressions,clicks,ctr,actions,cost_per_action_type",
        "date_preset": date_preset,
        "level": "campaign",
        "limit": "25",
    })
    if "error" in result:
        return f"Could not fetch campaigns: {result['error']}"

    data = result.get("data", [])
    if not data:
        return f"No campaign data for {date_preset}."

    lines = []
    for c in data:
        actions = c.get("actions", [])
        cost_per = c.get("cost_per_action_type", [])
        leads = next((a["value"] for a in actions if a["action_type"] == "lead"), "0")
        cpl_val = next((a["value"] for a in cost_per if a["action_type"] == "lead"), None)
        cpl = f"${float(cpl_val):.2f}" if cpl_val else "N/A"
        spend = float(c.get("spend", 0))
        ctr = float(c.get("ctr", 0))
        lines.append(f"- {c['campaign_name']}: ${spend:.2f} spent, {leads} leads, CPL {cpl}, CTR {ctr:.2f}%")

    return f"{len(data)} campaigns ({date_preset}):\n" + "\n".join(lines)


# ── All tools list for agent registration ─────────────────

ALL_TOOLS = [
    create_mission,
    list_missions,
    get_mission_result,
    search_memory,
    save_memory,
    get_memory_stats,
    get_team_status,
    get_costs,
    get_recent_activity,
    list_schedules,
    meta_list_accounts,
    meta_account_performance,
    meta_campaign_performance,
]
