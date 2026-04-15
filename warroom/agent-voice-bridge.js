#!/usr/bin/env node
/**
 * Agent Voice Bridge — standalone CLI that invokes a Blade employee
 * via the conversation engine and returns JSON to stdout.
 *
 * Called by the Python War Room server's answer_as_agent tool handler.
 *
 * Usage:
 *   node warroom/agent-voice-bridge.js \
 *     --agent chief-of-staff \
 *     --message "What's on my schedule today?" \
 *     --quick
 */

import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(__dirname, '..')

// Bootstrap: set cwd to project root so @blade/* packages resolve
process.chdir(projectRoot)

async function main() {
  const args = process.argv.slice(2)
  let agent = 'chief-of-staff'
  let message = ''
  let quick = false

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--agent' && args[i + 1]) agent = args[++i]
    else if (args[i] === '--message' && args[i + 1]) message = args[++i]
    else if (args[i] === '--quick') quick = true
  }

  if (!message) {
    console.log(JSON.stringify({ response: '', usage: { cost_usd: 0 }, error: 'No message provided' }))
    process.exit(1)
  }

  try {
    const { initializeDb } = await import('@blade/db')
    const { createExecutionAPI, buildMemoryAugmentedPrompt } = await import('@blade/core')
    const { createConversationEngine } = await import('@blade/conversation')

    initializeDb()

    const executionApi = createExecutionAPI()
    const engine = createConversationEngine(executionApi, {
      retrieveMemories: async (query) => buildMemoryAugmentedPrompt('', query),
    })

    const { responseText, cost } = await engine.replySync({
      message,
      userId: 'warroom',
      channel: 'api',
      employeeId: agent,
      maxIterations: quick ? 3 : 15,
    })

    console.log(JSON.stringify({
      response: responseText,
      usage: { cost_usd: cost },
      error: null,
    }))
  } catch (err) {
    console.log(JSON.stringify({
      response: '',
      usage: { cost_usd: 0 },
      error: err instanceof Error ? err.message : String(err),
    }))
    process.exit(1)
  }
}

main()
