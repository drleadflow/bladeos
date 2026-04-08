#!/usr/bin/env node

import { Command } from 'commander'
import { initializeDb } from '@blade/db'
import { runAgentLoop, getAllToolDefinitions } from '@blade/core'
import type { AgentMessage, ExecutionContext } from '@blade/core'
import { createInterface } from 'node:readline'

const program = new Command()

program
  .name('blade')
  .description('Blade Super Agent — The agent that learns AND ships code')
  .version('0.1.0')

// ============================================================
// CHAT COMMAND
// ============================================================

program
  .command('chat')
  .description('Start an interactive chat session with Blade')
  .option('-m, --model <model>', 'Model to use', 'claude-sonnet-4-20250514')
  .option('--budget <usd>', 'Cost budget in USD (0 = unlimited)', '0')
  .action(async (opts) => {
    const db = initializeDb()
    const conversationId = crypto.randomUUID()

    console.log('\n⚔️  Blade Super Agent v0.1.0')
    console.log('   Type your message. Press Ctrl+C to exit.\n')

    const messages: AgentMessage[] = []
    const tools = getAllToolDefinitions()

    const context: ExecutionContext = {
      conversationId,
      userId: 'cli-user',
      modelId: opts.model,
      maxIterations: 25,
      costBudget: parseFloat(opts.budget),
    }

    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    })

    const prompt = (): void => {
      rl.question('\nYou: ', async (input) => {
        const trimmed = input.trim()
        if (!trimmed) {
          prompt()
          return
        }

        if (trimmed === '/quit' || trimmed === '/exit') {
          console.log('\nGoodbye!')
          rl.close()
          db.close()
          process.exit(0)
        }

        messages.push({ role: 'user', content: trimmed })

        console.log('\nBlade: ', '')
        process.stdout.write('')

        try {
          const result = await runAgentLoop({
            systemPrompt: SYSTEM_PROMPT,
            messages,
            tools,
            context,
            onToolCall: (tc) => {
              const status = tc.success ? '✓' : '✗'
              console.log(`\n  [${status} ${tc.toolName}] ${tc.display.slice(0, 120)}`)
            },
          })

          console.log(result.finalResponse)
          console.log(`\n  Cost: $${result.totalCost.toFixed(4)} | Tools: ${result.totalToolCalls} | Stop: ${result.stopReason}`)

          // Add assistant response to history
          messages.push({ role: 'assistant', content: result.finalResponse })

        } catch (err) {
          console.error(`\nError: ${err instanceof Error ? err.message : String(err)}`)
        }

        prompt()
      })
    }

    prompt()
  })

// ============================================================
// JOBS COMMAND (placeholder)
// ============================================================

program
  .command('jobs')
  .description('List coding jobs')
  .action(async () => {
    initializeDb()
    const { jobs } = await import('@blade/db')
    const list = jobs.list()
    if (list.length === 0) {
      console.log('No jobs yet. Use `blade code "task"` to create one.')
      return
    }
    console.table(list)
  })

// ============================================================
// MEMORY COMMAND
// ============================================================

program
  .command('memory')
  .description('Search agent memories')
  .argument('[query]', 'Search query')
  .action(async (query?: string) => {
    initializeDb()
    const { memories } = await import('@blade/db')

    if (query) {
      try {
        const results = memories.search(query)
        if (results.length === 0) {
          console.log('No memories found.')
          return
        }
        console.table(results)
      } catch {
        const all = memories.getAll(20)
        console.table(all)
      }
    } else {
      const all = memories.getAll(20)
      if (all.length === 0) {
        console.log('No memories stored yet.')
        return
      }
      console.table(all)
    }
  })

// ============================================================
// COSTS COMMAND
// ============================================================

program
  .command('costs')
  .description('Show cost summary')
  .option('-d, --days <days>', 'Number of days', '30')
  .action(async (opts) => {
    initializeDb()
    const { costEntries } = await import('@blade/db')
    const summary = costEntries.summary(parseInt(opts.days, 10))
    console.log(`\nTotal spend: $${summary.totalUsd.toFixed(4)}`)
    console.log(`Tokens: ${summary.tokenCount.input.toLocaleString()} in / ${summary.tokenCount.output.toLocaleString()} out`)
    if (Object.keys(summary.byModel).length > 0) {
      console.log('\nBy model:')
      for (const [model, cost] of Object.entries(summary.byModel)) {
        console.log(`  ${model}: $${cost.toFixed(4)}`)
      }
    }
  })

// ============================================================
// SYSTEM PROMPT
// ============================================================

const SYSTEM_PROMPT = `You are Blade, an AI super agent built by Blade Labs. You are helpful, direct, and capable.

You have access to tools for memory management, file operations, and command execution.

Key behaviors:
- When the user tells you a preference or important fact, save it to memory using save_memory.
- When a topic comes up that you might have prior context on, use recall_memory to check.
- Be concise but thorough. Show your work when using tools.
- Track what works and what doesn't — you get better over time.

You are running locally on the user's machine. You have access to their filesystem and can run commands.`

program.parse()
