"""
WebSocket proxy for cross-origin voice connections.

Accepts WebSocket connections from any origin (e.g. the Lovable frontend)
and proxies all traffic — including binary audio frames — to the Pipecat
server running locally.

Usage:
  python warroom/proxy.py

Environment:
  VOICE_PROXY_PORT  Port to listen on (default: 7861)
  PIPECAT_URL       Pipecat server address (default: ws://localhost:7860)
"""

import asyncio
import os
import sys

from dotenv import load_dotenv
load_dotenv()

try:
    import websockets
    from websockets.server import serve as ws_serve
    from websockets.client import connect as ws_connect
except ImportError:
    print("[VoiceProxy] ERROR: 'websockets' package not found. Install pipecat-ai[websocket] or run: pip install websockets", file=sys.stderr)
    sys.exit(1)

PROXY_PORT = int(os.environ.get("VOICE_PROXY_PORT", "7861"))
PIPECAT_URL = os.environ.get("PIPECAT_URL", "ws://localhost:7860")


async def proxy_handler(client_ws):
    """Forward all traffic (text and binary) between client and Pipecat."""
    client_addr = getattr(client_ws, "remote_address", ("?", "?"))
    print(f"[VoiceProxy] Client connected from {client_addr[0]}:{client_addr[1]}")

    try:
        async with ws_connect(PIPECAT_URL) as pipecat_ws:
            print("[VoiceProxy] Connected to Pipecat")

            async def client_to_pipecat():
                async for message in client_ws:
                    await pipecat_ws.send(message)

            async def pipecat_to_client():
                async for message in pipecat_ws:
                    await client_ws.send(message)

            # Run both directions concurrently; stop when either side closes
            done, pending = await asyncio.wait(
                [
                    asyncio.ensure_future(client_to_pipecat()),
                    asyncio.ensure_future(pipecat_to_client()),
                ],
                return_when=asyncio.FIRST_COMPLETED,
            )
            for task in pending:
                task.cancel()

    except Exception as exc:
        print(f"[VoiceProxy] Session error: {exc}")
    finally:
        print(f"[VoiceProxy] Client disconnected from {client_addr[0]}:{client_addr[1]}")


async def main():
    print(f"[VoiceProxy] ws://0.0.0.0:{PROXY_PORT} -> {PIPECAT_URL}")
    # origins=None disables the Origin header check, allowing any cross-origin connection
    async with ws_serve(
        proxy_handler,
        "0.0.0.0",
        PROXY_PORT,
        origins=None,
    ):
        await asyncio.Future()  # run forever


if __name__ == "__main__":
    asyncio.run(main())
