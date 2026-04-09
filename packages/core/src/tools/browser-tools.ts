import { registerTool } from '../tool-registry.js'
import type { ToolCallResult, ExecutionContext } from '../types.js'

// ============================================================
// BROWSE URL (agent-browser navigation + snapshot)
// ============================================================

const AGENT_BROWSER_NOT_INSTALLED =
  'agent-browser not installed. Run: npm install -g agent-browser && agent-browser install'

function runAgentBrowser(args: string[]): { success: boolean; output: string } {
  try {
    const { execFileSync } = require('node:child_process') as typeof import('node:child_process')
    const output = execFileSync('agent-browser', args, {
      encoding: 'utf-8',
      timeout: 60_000,
      maxBuffer: 2 * 1024 * 1024,
    })
    return { success: true, output }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    if (
      message.includes('not found') ||
      message.includes('ENOENT') ||
      message.includes('command not found')
    ) {
      return { success: false, output: AGENT_BROWSER_NOT_INSTALLED }
    }
    return { success: false, output: `agent-browser error: ${message.slice(0, 2000)}` }
  }
}

registerTool(
  {
    name: 'browse_url',
    description:
      'Navigate to a URL and get a structured snapshot of the page content. Uses agent-browser for AI-optimized page understanding.',
    input_schema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The URL to navigate to',
        },
      },
      required: ['url'],
    },
    category: 'web',
  },
  async (input: Record<string, unknown>, _context: ExecutionContext): Promise<ToolCallResult> => {
    const url = input.url as string
    const navigateResult = runAgentBrowser(['navigate', url])
    if (!navigateResult.success) {
      return {
        toolUseId: '',
        toolName: 'browse_url',
        input,
        success: false,
        data: null,
        display: navigateResult.output,
        durationMs: 0,
        timestamp: new Date().toISOString(),
      }
    }
    const result = runAgentBrowser(['snapshot'])

    return {
      toolUseId: '',
      toolName: 'browse_url',
      input,
      success: result.success,
      data: result.success ? result.output : null,
      display: result.output,
      durationMs: 0,
      timestamp: new Date().toISOString(),
    }
  }
)

// ============================================================
// BROWSE CLICK (agent-browser click + snapshot)
// ============================================================

registerTool(
  {
    name: 'browse_click',
    description:
      'Click an element on the current page by its ref (e.g. @e5). Use browse_url first to get element refs.',
    input_schema: {
      type: 'object',
      properties: {
        ref: {
          type: 'string',
          description: 'The element ref to click (e.g. @e5)',
        },
      },
      required: ['ref'],
    },
    category: 'web',
  },
  async (input: Record<string, unknown>, _context: ExecutionContext): Promise<ToolCallResult> => {
    const ref = input.ref as string
    const clickResult = runAgentBrowser(['click', ref])
    if (!clickResult.success) {
      return {
        toolUseId: '',
        toolName: 'browse_click',
        input,
        success: false,
        data: null,
        display: clickResult.output,
        durationMs: 0,
        timestamp: new Date().toISOString(),
      }
    }
    const result = runAgentBrowser(['snapshot'])

    return {
      toolUseId: '',
      toolName: 'browse_click',
      input,
      success: result.success,
      data: result.success ? result.output : null,
      display: result.output,
      durationMs: 0,
      timestamp: new Date().toISOString(),
    }
  }
)

// ============================================================
// BROWSE TYPE (agent-browser type + snapshot)
// ============================================================

registerTool(
  {
    name: 'browse_type',
    description:
      'Type text into a form field by its ref. Use browse_url first to get element refs.',
    input_schema: {
      type: 'object',
      properties: {
        ref: {
          type: 'string',
          description: 'The element ref to type into (e.g. @e5)',
        },
        text: {
          type: 'string',
          description: 'The text to type',
        },
      },
      required: ['ref', 'text'],
    },
    category: 'web',
  },
  async (input: Record<string, unknown>, _context: ExecutionContext): Promise<ToolCallResult> => {
    const ref = input.ref as string
    const text = input.text as string
    const typeResult = runAgentBrowser(['type', ref, text])
    if (!typeResult.success) {
      return {
        toolUseId: '',
        toolName: 'browse_type',
        input,
        success: false,
        data: null,
        display: typeResult.output,
        durationMs: 0,
        timestamp: new Date().toISOString(),
      }
    }
    const result = runAgentBrowser(['snapshot'])

    return {
      toolUseId: '',
      toolName: 'browse_type',
      input,
      success: result.success,
      data: result.success ? result.output : null,
      display: result.output,
      durationMs: 0,
      timestamp: new Date().toISOString(),
    }
  }
)

// ============================================================
// BROWSE SCREENSHOT (agent-browser screenshot)
// ============================================================

registerTool(
  {
    name: 'browse_screenshot',
    description:
      'Take a screenshot of the current page and save it to a file.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'File path to save the screenshot (default: /tmp/blade-screenshot.png)',
        },
      },
      required: [],
    },
    category: 'web',
  },
  async (input: Record<string, unknown>, _context: ExecutionContext): Promise<ToolCallResult> => {
    const filePath = (input.path as string) || '/tmp/blade-screenshot.png'
    const result = runAgentBrowser(['screenshot', '--path', filePath])

    return {
      toolUseId: '',
      toolName: 'browse_screenshot',
      input,
      success: result.success,
      data: result.success ? { path: filePath } : null,
      display: result.success
        ? `Screenshot saved to ${filePath}`
        : result.output,
      durationMs: 0,
      timestamp: new Date().toISOString(),
    }
  }
)
