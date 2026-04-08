import crypto from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { registerTool } from '../tool-registry.js'
import type { ToolCallResult, ExecutionContext } from '../types.js'
import { textToSpeech } from '../voice/cartesia-tts.js'

// ============================================================
// SPEAK — Text to Speech via Cartesia
// ============================================================

registerTool(
  {
    name: 'speak',
    description:
      'Convert text to speech using Cartesia. Returns an audio file path.',
    input_schema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'The text to convert to speech',
        },
        save_path: {
          type: 'string',
          description:
            'Optional file path to save the audio. Defaults to /tmp/blade-speech-<uuid>.mp3',
        },
      },
      required: ['text'],
    },
    category: 'system',
  },
  async (
    input: Record<string, unknown>,
    _context: ExecutionContext
  ): Promise<ToolCallResult> => {
    const text = input.text as string
    const savePath =
      (input.save_path as string | undefined) ??
      `/tmp/blade-speech-${crypto.randomUUID()}.mp3`

    const audioBuffer = await textToSpeech(text)
    await writeFile(savePath, audioBuffer)

    return {
      toolUseId: '',
      toolName: 'speak',
      input,
      success: true,
      data: { filePath: savePath, sizeBytes: audioBuffer.length },
      display: `Generated speech audio saved to ${savePath} (${audioBuffer.length} bytes)`,
      durationMs: 0,
      timestamp: new Date().toISOString(),
    }
  }
)
