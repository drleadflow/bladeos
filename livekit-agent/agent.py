"""
Blade Voice Agent — LiveKit + Gemini LLM + Cartesia TTS

Run:
  python agent.py dev     # Dev mode (connects to LiveKit Cloud, hot reload)
  python agent.py start   # Production mode
  python agent.py console # Local terminal mode (no LiveKit server needed)
"""

import asyncio
import logging
import os

from dotenv import load_dotenv

load_dotenv()

from livekit.agents import (
    Agent,
    AgentServer,
    AgentSession,
    JobContext,
    JobProcess,
    cli,
    room_io,
)
from livekit.plugins import cartesia, google, silero

from tools import ALL_TOOLS

logger = logging.getLogger("blade-agent")

# Agent personas for each employee
AGENT_PERSONAS: dict[str, dict[str, str]] = {
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
    "research": {
        "name": "Nova",
        "instructions": (
            "You are Nova, the research analyst for Blade Command. "
            "You investigate, synthesize, and validate information with evidence. "
            "You specialize in health and wealth domains. "
            "Be analytical and thorough. Cite sources when possible. "
            "Do not use emojis, asterisks, markdown, or other special characters in your responses."
        ),
    },
    "comms": {
        "name": "Echo",
        "instructions": (
            "You are Echo, the communications lead for Blade Command. "
            "You handle messaging, relationship building, outreach, and communication strategy. "
            "You specialize in business and relationships domains. "
            "Be warm but direct. Focus on clear, actionable messaging. "
            "Do not use emojis, asterisks, markdown, or other special characters in your responses."
        ),
    },
    "content": {
        "name": "Muse",
        "instructions": (
            "You are Muse, the content creator for Blade Command. "
            "You write copy, design content strategy, and manage social presence. "
            "Be creative and energetic. Focus on engaging, platform-native content. "
            "Do not use emojis, asterisks, markdown, or other special characters in your responses."
        ),
    },
    "ops": {
        "name": "Forge",
        "instructions": (
            "You are Forge, the operations manager for Blade Command. "
            "You handle systems, automation, code deployment, infrastructure, and process optimization. "
            "Be precise and reliable. Give clear step-by-step guidance. "
            "Do not use emojis, asterisks, markdown, or other special characters in your responses."
        ),
    },
}

DEFAULT_AGENT = "chief-of-staff"


def get_agent_config(slug: str = DEFAULT_AGENT) -> dict[str, str]:
    return AGENT_PERSONAS.get(slug, AGENT_PERSONAS[DEFAULT_AGENT])


server = AgentServer()


def prewarm(proc: JobProcess) -> None:
    proc.userdata["vad"] = silero.VAD.load(
        min_speech_duration=0.15,       # Require 150ms of speech before triggering (default 50ms)
        min_silence_duration=0.8,       # Wait 800ms of silence before ending turn (default 550ms)
        activation_threshold=0.6,       # Higher threshold = less false activation (default 0.5)
        prefix_padding_duration=0.4,    # Keep 400ms of audio before speech starts
    )


server.setup_fnc = prewarm


async def monitor_events(session: AgentSession) -> None:
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

        if len(seen_event_ids) > 200:
            seen_event_ids.clear()


@server.rtc_session()
async def entrypoint(ctx: JobContext) -> None:
    ctx.log_context_fields = {"room": ctx.room.name}

    # Determine which agent persona to use from room metadata
    agent_slug = ctx.room.metadata or DEFAULT_AGENT
    config = get_agent_config(agent_slug)

    logger.info(f"Starting Blade voice agent [{config['name']}] in room [{ctx.room.name}]")

    session = AgentSession(
        vad=ctx.proc.userdata["vad"],
        stt=google.STT(
            languages=["en-US"],
            model="latest_long",
        ),
        llm=google.LLM(
            model="gemini-2.5-flash",
            temperature=0.7,
        ),
        tts=cartesia.TTS(
            model="sonic-3",
            voice="87748186-691b-497d-a547-4ed1e391400f",  # Nolan — deep, commanding male voice
            speed="normal",
        ),
        # Reduce glitchy cutoffs and false interruptions
        min_endpointing_delay=0.8,
        max_endpointing_delay=3.0,
        min_interruption_duration=0.8,
        min_interruption_words=3,
        allow_interruptions=True,
    )

    await session.start(
        agent=Agent(instructions=config["instructions"], tools=ALL_TOOLS),
        room=ctx.room,
        room_options=room_io.RoomOptions(
            audio_input=room_io.AudioInputOptions(),
        ),
    )

    # Start background event monitor for urgent interrupts
    monitor_task = asyncio.create_task(monitor_events(session))

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


if __name__ == "__main__":
    cli.run_app(server)
