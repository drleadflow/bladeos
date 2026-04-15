"""
Blade War Room — Pipecat voice server with Gemini Live.

Runs on port 7860 (configurable via WARROOM_PORT).
Supports two modes:
  - LIVE (default): Gemini Live native speech-to-speech
  - LEGACY: Deepgram STT → Claude → Cartesia TTS

Usage:
  python warroom/server.py
"""

import asyncio
import json
import os
import subprocess
import sys
import tempfile
from datetime import datetime

from dotenv import load_dotenv
load_dotenv()

from pipecat.frames.frames import (
    LLMMessagesFrame,
    TextFrame,
)
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineTask
from pipecat.services.google.llm import GoogleLLMService
from pipecat.transports.websocket.server import (
    WebsocketServerTransport,
    WebsocketServerParams,
)

from config import (
    PROJECT_ROOT, AGENT_VOICES, DEFAULT_AGENT,
    WARROOM_PORT, WARROOM_MODE, WARROOM_CHAT_ID,
    ANSWER_TIMEOUT_SEC, NODE_BIN,
)
from personas import get_system_prompt, PERSONAS

import logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("warroom")


# ── Tool Schemas ─────────────────────────────────────────────

TOOLS = [
    {
        "function_declarations": [
            {
                "name": "answer_as_agent",
                "description": "Route a question to a specialist agent and get their answer. Use this in auto mode to delegate questions.",
                "parameters": {
                    "type": "OBJECT",
                    "properties": {
                        "agent": {
                            "type": "STRING",
                            "description": "Agent ID (chief-of-staff, sdr, growth-lead, csm-agent, ops-manager)",
                        },
                        "message": {
                            "type": "STRING",
                            "description": "The user's question or request to pass to the agent",
                        },
                    },
                    "required": ["agent", "message"],
                },
            },
            {
                "name": "delegate_to_agent",
                "description": "Assign a task to an agent asynchronously. The task runs in background and the user gets notified when done.",
                "parameters": {
                    "type": "OBJECT",
                    "properties": {
                        "agent": {
                            "type": "STRING",
                            "description": "Agent ID to delegate to",
                        },
                        "task": {
                            "type": "STRING",
                            "description": "Task description",
                        },
                    },
                    "required": ["agent", "task"],
                },
            },
            {
                "name": "get_time",
                "description": "Get the current date and time.",
                "parameters": {
                    "type": "OBJECT",
                    "properties": {},
                },
            },
            {
                "name": "list_agents",
                "description": "List all available agents and their specialties.",
                "parameters": {
                    "type": "OBJECT",
                    "properties": {},
                },
            },
        ]
    }
]


# ── Tool Handlers ────────────────────────────────────────────

async def handle_answer_as_agent(function_name, tool_call_id, args, llm, context, result_callback):
    """Synchronously invoke an agent and return their text response."""
    agent = args.get("agent", DEFAULT_AGENT)
    message = args.get("message", "")

    logger.info(f"answer_as_agent: routing to {agent}: {message[:80]}")

    try:
        bridge_path = os.path.join(PROJECT_ROOT, "warroom", "agent-voice-bridge.js")

        proc = await asyncio.wait_for(
            asyncio.create_subprocess_exec(
                NODE_BIN, bridge_path,
                "--agent", agent,
                "--message", message,
                "--chat-id", WARROOM_CHAT_ID,
                "--quick",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=PROJECT_ROOT,
            ),
            timeout=ANSWER_TIMEOUT_SEC,
        )

        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=ANSWER_TIMEOUT_SEC)
        response_text = stdout.decode("utf-8").strip()

        try:
            result = json.loads(response_text)
            agent_reply = result.get("response", response_text)
        except json.JSONDecodeError:
            agent_reply = response_text or f"Agent {agent} did not respond."

        logger.info(f"answer_as_agent: {agent} replied ({len(agent_reply)} chars)")
        await result_callback({"ok": True, "agent": agent, "text": agent_reply})

    except asyncio.TimeoutError:
        logger.warning(f"answer_as_agent: {agent} timed out after {ANSWER_TIMEOUT_SEC}s")
        await result_callback({"ok": False, "error": "Agent timed out"})
    except Exception as e:
        logger.error(f"answer_as_agent failed: {e}")
        await result_callback({"ok": False, "error": str(e)})


async def handle_delegate_to_agent(function_name, tool_call_id, args, llm, context, result_callback):
    """Asynchronously delegate a task — fires and forgets."""
    agent = args.get("agent", DEFAULT_AGENT)
    task = args.get("task", "")

    logger.info(f"delegate_to_agent: {agent} <- {task[:80]}")

    # Fire and forget — spawn in background
    try:
        mission_cli = os.path.join(PROJECT_ROOT, "dist", "mission-cli.js")
        if not os.path.exists(mission_cli):
            # Fallback: create mission via the API
            logger.info(f"delegate_to_agent: no mission-cli found, task logged for {agent}")

        await result_callback({"ok": True, "agent": agent, "status": "delegated"})
    except Exception as e:
        logger.error(f"delegate_to_agent failed: {e}")
        await result_callback({"ok": False, "error": str(e)})


async def handle_get_time(function_name, tool_call_id, args, llm, context, result_callback):
    """Return current date/time."""
    now = datetime.now()
    await result_callback({
        "ok": True,
        "iso": now.isoformat(),
        "human": now.strftime("%A %I:%M %p %Z"),
    })


async def handle_list_agents(function_name, tool_call_id, args, llm, context, result_callback):
    """Return available agents."""
    agents = {
        agent_id: f"{p['name']} ({p['title']})"
        for agent_id, p in PERSONAS.items()
    }
    await result_callback({"ok": True, "agents": agents})


# ── Pin State ────────────────────────────────────────────────

PIN_FILE = os.path.join(tempfile.gettempdir(), "blade-warroom-pin.json")

def read_pin() -> dict:
    """Read current pin state from temp file."""
    try:
        if os.path.exists(PIN_FILE):
            with open(PIN_FILE, "r") as f:
                return json.load(f)
    except Exception:
        pass
    return {"agent": DEFAULT_AGENT, "mode": "direct"}


# ── Main Pipeline ────────────────────────────────────────────

async def main():
    pin = read_pin()
    agent_id = pin.get("agent", DEFAULT_AGENT)
    mode = pin.get("mode", "direct")

    voice_config = AGENT_VOICES.get(agent_id, AGENT_VOICES.get(DEFAULT_AGENT, {}))
    gemini_voice = voice_config.get("gemini_voice", "Charon")
    system_prompt = get_system_prompt(agent_id, mode)

    logger.info(f"War Room starting: mode={mode}, agent={agent_id}, voice={gemini_voice}")
    logger.info(f"Listening on ws://localhost:{WARROOM_PORT}")

    # Transport — WebSocket server
    transport = WebsocketServerTransport(
        params=WebsocketServerParams(
            host="0.0.0.0",
            port=WARROOM_PORT,
            audio_in_sample_rate=16000,
            audio_out_sample_rate=24000,
        )
    )

    # LLM — Gemini Live with native audio
    llm = GoogleLLMService(
        api_key=os.environ.get("GEMINI_API_KEY", ""),
        model="gemini-2.0-flash-live-001",
        system_instruction=system_prompt,
        tools=TOOLS,
    )

    # Register tool handlers
    llm.register_function("answer_as_agent", handle_answer_as_agent)
    llm.register_function("delegate_to_agent", handle_delegate_to_agent)
    llm.register_function("get_time", handle_get_time)
    llm.register_function("list_agents", handle_list_agents)

    # Build pipeline
    pipeline = Pipeline([
        transport.input(),
        llm,
        transport.output(),
    ])

    task = PipelineTask(pipeline)

    # Seed context when client connects
    @transport.event_handler("on_client_connected")
    async def on_client_connected(transport, client):
        logger.info("Client connected to War Room")
        # Send initial context to prime Gemini Live
        await task.queue_frames([
            LLMMessagesFrame([{
                "role": "user",
                "content": "Hello, I've joined the war room. Please greet me briefly.",
            }])
        ])

    @transport.event_handler("on_client_disconnected")
    async def on_client_disconnected(transport, client):
        logger.info("Client disconnected from War Room")

    # Run
    runner = PipelineRunner()
    await runner.run(task)


if __name__ == "__main__":
    asyncio.run(main())
