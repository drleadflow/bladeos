/**
 * ElevenLabs Text-to-Speech integration.
 * Primary TTS provider with highest quality voice cloning.
 */

import { logger } from '@blade/shared'

export interface ElevenLabsTTSOptions {
  voiceId?: string
  modelId?: string
  stability?: number
  similarityBoost?: number
}

const DEFAULT_VOICE_ID = '21m00Tcm4TlvDq8ikWAM' // Rachel
const DEFAULT_MODEL = 'eleven_turbo_v2_5'

export async function elevenLabsTTS(
  text: string,
  options?: ElevenLabsTTSOptions
): Promise<Buffer> {
  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) {
    throw new Error('Missing ELEVENLABS_API_KEY')
  }

  const voiceId = options?.voiceId ?? DEFAULT_VOICE_ID
  const modelId = options?.modelId ?? DEFAULT_MODEL

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: modelId,
        voice_settings: {
          stability: options?.stability ?? 0.5,
          similarity_boost: options?.similarityBoost ?? 0.75,
        },
      }),
    }
  )

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`ElevenLabs TTS failed (${response.status}): ${errorText.slice(0, 200)}`)
  }

  const arrayBuffer = await response.arrayBuffer()
  return Buffer.from(arrayBuffer)
}
