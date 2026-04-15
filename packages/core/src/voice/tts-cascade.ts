/**
 * TTS Cascade — tries providers in order until one succeeds.
 * ElevenLabs → Cartesia → error
 *
 * Each agent can have a different voice configuration.
 */

import { elevenLabsTTS } from './elevenlabs-tts.js'
import { textToSpeech as cartesiaTTS } from './cartesia-tts.js'
import { logger } from '@blade/shared'

export interface AgentVoiceConfig {
  name: string
  elevenLabsVoiceId?: string
  cartesiaVoiceId?: string
  description?: string
}

/** Default voice configs per agent role */
export const AGENT_VOICES: Record<string, AgentVoiceConfig> = {
  'chief-of-staff': {
    name: 'Main',
    elevenLabsVoiceId: '21m00Tcm4TlvDq8ikWAM', // Rachel - informative
    cartesiaVoiceId: 'a0e99841-438c-4a64-b679-ae501e7d6091',
    description: 'Confident, informative',
  },
  'sdr': {
    name: 'SDR',
    elevenLabsVoiceId: 'EXAVITQu4vr4xnSDxMaL', // Bella - warm
    cartesiaVoiceId: 'a0e99841-438c-4a64-b679-ae501e7d6091',
    description: 'Direct, energetic',
  },
  'growth-lead': {
    name: 'Growth',
    elevenLabsVoiceId: 'ErXwobaYiN019PkySvjV', // Antoni - analytical
    cartesiaVoiceId: 'a0e99841-438c-4a64-b679-ae501e7d6091',
    description: 'Analytical, strategic',
  },
  'csm-agent': {
    name: 'CSM',
    elevenLabsVoiceId: 'MF3mGyEYCl7XYWbV9V6O', // Elli - youthful
    cartesiaVoiceId: 'a0e99841-438c-4a64-b679-ae501e7d6091',
    description: 'Warm, supportive',
  },
  default: {
    name: 'Default',
    elevenLabsVoiceId: '21m00Tcm4TlvDq8ikWAM',
    cartesiaVoiceId: 'a0e99841-438c-4a64-b679-ae501e7d6091',
    description: 'Neutral, clear',
  },
}

/**
 * Synthesize speech using cascade: ElevenLabs → Cartesia
 * Returns MP3 audio buffer.
 */
export async function synthesizeSpeech(
  text: string,
  agentSlug?: string
): Promise<Buffer> {
  const voiceConfig = AGENT_VOICES[agentSlug ?? ''] ?? AGENT_VOICES.default

  // Try ElevenLabs first
  if (process.env.ELEVENLABS_API_KEY) {
    try {
      const audio = await elevenLabsTTS(text, {
        voiceId: voiceConfig.elevenLabsVoiceId,
      })
      return audio
    } catch (err) {
      logger.warn('TTSCascade', `ElevenLabs failed, trying Cartesia: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // Fallback to Cartesia
  if (process.env.CARTESIA_API_KEY) {
    try {
      const audio = await cartesiaTTS(text, {
        voiceId: voiceConfig.cartesiaVoiceId,
        outputFormat: 'mp3',
      })
      return audio
    } catch (err) {
      logger.error('TTSCascade', `Cartesia also failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  throw new Error('All TTS providers failed — check ELEVENLABS_API_KEY or CARTESIA_API_KEY')
}
