import { registerTool } from '../tool-registry.js'
import type { ToolCallResult, ExecutionContext } from '../types.js'
import { stringifyError } from './web-search.js'

// ============================================================
// ANALYZE IMAGE (AI vision via Anthropic API)
// ============================================================

registerTool(
  {
    name: 'analyze_image',
    description:
      'Analyze an image using AI vision. Can describe screenshots, UI mockups, diagrams, error messages, etc.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Absolute path to the image file',
        },
        question: {
          type: 'string',
          description: 'Question to ask about the image (default: "Describe what you see in this image.")',
        },
      },
      required: ['path'],
    },
    category: 'system',
  },
  async (input: Record<string, unknown>, _context: ExecutionContext): Promise<ToolCallResult> => {
    const filePath = input.path as string
    const question = (input.question as string) || 'Describe what you see in this image.'

    try {
      const { readFileSync, existsSync } = await import('node:fs')
      const { extname } = await import('node:path')

      if (!existsSync(filePath)) {
        return {
          toolUseId: '',
          toolName: 'analyze_image',
          input,
          success: false,
          data: null,
          display: `Image file not found: ${filePath}`,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        }
      }

      const apiKey = process.env.ANTHROPIC_API_KEY
      if (!apiKey) {
        return {
          toolUseId: '',
          toolName: 'analyze_image',
          input,
          success: false,
          data: null,
          display: 'Missing ANTHROPIC_API_KEY environment variable.',
          durationMs: 0,
          timestamp: new Date().toISOString(),
        }
      }

      const imageBuffer = readFileSync(filePath)
      const base64Data = imageBuffer.toString('base64')

      const ext = extname(filePath).toLowerCase()
      const mediaTypeMap: Record<string, string> = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
      }
      const mediaType = mediaTypeMap[ext] || 'image/png'

      const Anthropic = (await import('@anthropic-ai/sdk')).default
      const client = new Anthropic({ apiKey })

      const response = await client.messages.create({
        model: 'claude-haiku-4-20250514',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mediaType as 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp',
                  data: base64Data,
                },
              },
              {
                type: 'text',
                text: question,
              },
            ],
          },
        ],
      })

      const textBlock = response.content.find(
        (block: { type: string }) => block.type === 'text'
      ) as { type: 'text'; text: string } | undefined
      const analysis = textBlock?.text ?? 'No analysis returned.'

      return {
        toolUseId: '',
        toolName: 'analyze_image',
        input,
        success: true,
        data: analysis,
        display: analysis,
        durationMs: 0,
        timestamp: new Date().toISOString(),
      }
    } catch (error) {
      return {
        toolUseId: '',
        toolName: 'analyze_image',
        input,
        success: false,
        data: null,
        display: `Image analysis failed: ${stringifyError(error)}`,
        durationMs: 0,
        timestamp: new Date().toISOString(),
      }
    }
  }
)
