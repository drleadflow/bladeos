/**
 * War Room Pipeline — orchestrates the voice conversation loop:
 *   1. Receive audio from browser mic
 *   2. Transcribe via Deepgram STT
 *   3. Route to selected agent via conversation engine
 *   4. Synthesize response via TTS cascade
 *   5. Return audio + transcript to browser
 */

import { speechToText } from './deepgram-stt.js'
import { synthesizeSpeech } from './tts-cascade.js'
import { logger } from '@blade/shared'

export interface WarRoomTurn {
  userTranscript: string
  agentText: string
  agentAudio: Buffer
  agentSlug: string
  costUsd: number
  durationMs: number
}

export interface WarRoomSession {
  id: string
  activeAgent: string
  conversationId: string | null
  turns: { role: 'user' | 'agent'; text: string; agentSlug?: string; timestamp: string }[]
  totalCost: number
}

const sessions = new Map<string, WarRoomSession>()

export function createWarRoomSession(id: string, initialAgent: string): WarRoomSession {
  const session: WarRoomSession = {
    id,
    activeAgent: initialAgent,
    conversationId: null,
    turns: [],
    totalCost: 0,
  }
  sessions.set(id, session)
  return session
}

export function getWarRoomSession(id: string): WarRoomSession | undefined {
  return sessions.get(id)
}

export function setActiveAgent(sessionId: string, agentSlug: string): void {
  const session = sessions.get(sessionId)
  if (session) {
    session.activeAgent = agentSlug
  }
}

export function getSessionTranscript(sessionId: string): WarRoomSession['turns'] {
  return sessions.get(sessionId)?.turns ?? []
}

/**
 * Process a single voice turn:
 *   audio in → transcribe → get agent reply → synthesize speech
 *
 * The `getAgentReply` callback handles the actual conversation engine call,
 * allowing the war room to be decoupled from the conversation layer.
 */
export async function processVoiceTurn(
  sessionId: string,
  audioBuffer: Buffer,
  getAgentReply: (message: string, agentSlug: string) => Promise<{ text: string; cost: number }>
): Promise<WarRoomTurn> {
  const start = Date.now()
  const session = sessions.get(sessionId)
  if (!session) throw new Error(`War room session ${sessionId} not found`)

  const agentSlug = session.activeAgent

  // Step 1: Transcribe
  let userTranscript: string
  try {
    userTranscript = await speechToText(audioBuffer)
  } catch (err) {
    throw new Error(`STT failed: ${err instanceof Error ? err.message : String(err)}`)
  }

  if (!userTranscript.trim()) {
    throw new Error('Empty transcript — no speech detected')
  }

  // Log user turn
  session.turns.push({
    role: 'user',
    text: userTranscript,
    timestamp: new Date().toISOString(),
  })

  // Step 2: Get agent reply
  let agentText: string
  let cost: number
  try {
    const reply = await getAgentReply(userTranscript, agentSlug)
    agentText = reply.text
    cost = reply.cost
  } catch (err) {
    throw new Error(`Agent reply failed: ${err instanceof Error ? err.message : String(err)}`)
  }

  // Log agent turn
  session.turns.push({
    role: 'agent',
    text: agentText,
    agentSlug,
    timestamp: new Date().toISOString(),
  })

  // Step 3: Synthesize speech
  let agentAudio: Buffer
  try {
    // Truncate very long responses for TTS (max ~500 chars for reasonable audio)
    const ttsText = agentText.length > 500 ? agentText.slice(0, 497) + '...' : agentText
    agentAudio = await synthesizeSpeech(ttsText, agentSlug)
  } catch (err) {
    logger.error('WarRoom', `TTS failed: ${err instanceof Error ? err.message : String(err)}`)
    // Return empty audio — the transcript will still show
    agentAudio = Buffer.alloc(0)
  }

  session.totalCost += cost
  const durationMs = Date.now() - start

  return {
    userTranscript,
    agentText,
    agentAudio,
    agentSlug,
    costUsd: cost,
    durationMs,
  }
}

export function destroyWarRoomSession(id: string): void {
  sessions.delete(id)
}
