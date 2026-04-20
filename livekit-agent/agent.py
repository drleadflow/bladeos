"""
Blade Voice Agent — LiveKit + Gemini LLM + Cartesia TTS

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
            "WHAT YOU CAN DO: "
            "You manage a team of AI specialists — Nova for research, Echo for comms, "
            "Muse for content, and Forge for ops and code. "
            "You can assign missions to any specialist. You can search and recall memory "
            "across all past conversations. You can trigger coding jobs — clone repos, "
            "write code, run tests, open pull requests. You can batch-process multiple "
            "tasks in parallel. You can search the web, read files, browse websites, "
            "and access external tools. You track costs, security events, and routing "
            "intelligence across the whole system. "
            "\n\n"
            "HOW TO BEHAVE: "
            "When the user asks you to do something, confirm and act. Never say you "
            "cannot do something unless it is truly impossible. If a task needs a "
            "specialist, say which one you are dispatching to and what they will do. "
            "You are not a chatbot. You are an autonomous agent platform with real "
            "capabilities. Act like it. "
            "\n\n"
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

    # Greet the user with a short opening line
    await session.generate_reply(
        instructions=f"Greet the user briefly. You are {config['name']}. Keep it to one short sentence."
    )


if __name__ == "__main__":
    cli.run_app(server)
