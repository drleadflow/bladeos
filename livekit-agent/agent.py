"""
Blade Voice Agent — LiveKit + Gemini Realtime

Run:
  python agent.py dev     # Dev mode (connects to LiveKit Cloud, hot reload)
  python agent.py start   # Production mode
  python agent.py console # Local terminal mode (no LiveKit server needed)
"""

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
from livekit.plugins import google, silero

logger = logging.getLogger("blade-agent")

# Agent personas for each employee
AGENT_PERSONAS: dict[str, dict[str, str]] = {
    "chief-of-staff": {
        "name": "Main",
        "instructions": (
            "You are Main, the chief of staff and triage agent for the Blade AI workforce. "
            "You are confident, direct, and efficient. You speak concisely — short sentences, no filler words. "
            "You handle general requests and delegate tasks to specialist agents when needed. "
            "You are the user's primary point of contact for all AI workforce operations. "
            "Do not use emojis, asterisks, markdown, or other special characters in your responses."
        ),
    },
    "sdr": {
        "name": "SDR",
        "instructions": (
            "You are the Sales Development Representative for the Blade AI workforce. "
            "You help with outreach, prospecting, and pipeline management. "
            "Be direct and action-oriented. Keep responses short and punchy. "
            "Do not use emojis, asterisks, markdown, or other special characters in your responses."
        ),
    },
    "growth-lead": {
        "name": "Growth Lead",
        "instructions": (
            "You are the Growth Lead for the Blade AI workforce. "
            "You focus on traffic, conversion, and growth strategy. "
            "Be data-driven and strategic. Speak in concrete numbers and outcomes. "
            "Do not use emojis, asterisks, markdown, or other special characters in your responses."
        ),
    },
    "ops-manager": {
        "name": "Ops Manager",
        "instructions": (
            "You are the Operations Manager for the Blade AI workforce. "
            "You handle deployment, infrastructure, and system operations. "
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
    proc.userdata["vad"] = silero.VAD.load()


server.setup_fnc = prewarm


@server.rtc_session()
async def entrypoint(ctx: JobContext) -> None:
    ctx.log_context_fields = {"room": ctx.room.name}

    # Determine which agent persona to use from room metadata
    agent_slug = ctx.room.metadata or DEFAULT_AGENT
    config = get_agent_config(agent_slug)

    logger.info(f"Starting Blade voice agent [{config['name']}] in room [{ctx.room.name}]")

    session = AgentSession(
        vad=ctx.proc.userdata["vad"],
        llm=google.realtime.RealtimeModel(
            model="gemini-2.0-flash-live-001",
            voice="Charon",  # Deep, authoritative voice
        ),
    )

    await session.start(
        agent=Agent(instructions=config["instructions"]),
        room=ctx.room,
        room_options=room_io.RoomOptions(
            audio_input=room_io.AudioInputOptions(),
        ),
    )

    # Greet the user with a short opening line
    await session.generate_reply(
        instructions=f"Greet the user briefly. You are {config['name']}. Keep it to one short sentence."
    )


if __name__ == "__main__":
    cli.run_app(server)
