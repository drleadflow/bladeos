#!/usr/bin/env node

import 'dotenv/config'
import { Command } from 'commander'
import { initializeDb, jobs, jobLogs } from '@blade/db'
import { runAgentLoop, getAllToolDefinitions, getAllEmployees, getActiveEmployees, getEmployee, getScorecard, formatScorecard, generateMorningBriefing } from '@blade/core'
import type { AgentMessage, ExecutionContext } from '@blade/core'
import { loadConfig } from '@blade/shared'
import { createInterface } from 'node:readline'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { execSync, spawn } from 'node:child_process'

const program = new Command()

program
  .name('blade')
  .description('Blade Super Agent — The agent that learns AND ships code')
  .version('0.1.0')

// ============================================================
// LOGIN COMMAND
// ============================================================

program
  .command('login')
  .description('Authenticate with a remote Blade dashboard')
  .action(async () => {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    const ask = (q: string): Promise<string> => new Promise(resolve => rl.question(q, resolve))
    const bladeDir = join(homedir(), '.blade')
    const configPath = join(bladeDir, 'config.json')

    console.log('\n⚔️  Blade Super Agent — Dashboard Login\n')

    // 1. Get URL
    const url = (await ask('Dashboard URL (e.g., http://localhost:3000): ')).trim()
    if (!url) {
      console.log('\nCancelled.')
      rl.close()
      return
    }

    // 2. Get Token
    const token = (await ask('Authentication token: ')).trim()
    if (!token) {
      console.log('\nCancelled.')
      rl.close()
      return
    }

    // 3. Save config
    mkdirSync(bladeDir, { recursive: true })
    let config = {}
    if (existsSync(configPath)) {
      try {
        config = JSON.parse(readFileSync(configPath, 'utf-8'))
      } catch {
        // ignore malformed config
      }
    }

    const newConfig = {
      ...config,
      dashboard: {
        url,
        token,
      },
    }

    writeFileSync(configPath, JSON.stringify(newConfig, null, 2) + '\n')
    console.log(`\n✓ Logged in. Configuration saved to ${configPath}\n`)

    rl.close()
  })

// ============================================================
// SETUP COMMAND
// ============================================================

program
  .command('setup')
  .description('Interactive setup wizard — configure API keys, GitHub, and preferences')
  .action(async () => {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    const ask = (q: string): Promise<string> => new Promise(resolve => rl.question(q, resolve))

    const bladeDir = join(homedir(), '.blade')
    const envPath = join(process.cwd(), '.env')

    console.log('\n⚔️  Blade Super Agent — Setup Wizard\n')
    console.log('This will configure your Blade installation.\n')

    // ---- Step 1: Anthropic API Key ----
    console.log('━━━ Step 1: Anthropic API Key ━━━\n')
    console.log('You have two options:')
    console.log('  1) Use your Claude Pro/Max subscription (free if you already pay for Claude)')
    console.log('  2) Use an Anthropic API key (pay-per-use)\n')

    const authChoice = await ask('Which option? [1/2]: ')

    let anthropicKey = ''

    if (authChoice.trim() === '1') {
      // Check if Claude Code CLI is installed
      let hasClaudeCli = false
      try {
        execSync('claude --version', { stdio: 'pipe' })
        hasClaudeCli = true
      } catch {
        // not installed
      }

      if (!hasClaudeCli) {
        console.log('\nClaude Code CLI is required for subscription auth.')
        console.log('Install it with: npm install -g @anthropic-ai/claude-code\n')
        const install = await ask('Install it now? [Y/n]: ')
        if (install.trim().toLowerCase() !== 'n') {
          console.log('\nInstalling Claude Code CLI...')
          try {
            execSync('npm install -g @anthropic-ai/claude-code', { stdio: 'inherit' })
            hasClaudeCli = true
          } catch {
            console.log('\nInstall failed. Please install manually: npm install -g @anthropic-ai/claude-code')
          }
        }
      }

      if (hasClaudeCli) {
        console.log('\nGenerating OAuth token from your Claude subscription...')
        console.log('This will open your browser to log in.\n')
        try {
          const token = execSync('claude setup-token', { encoding: 'utf-8', stdio: ['inherit', 'pipe', 'inherit'] }).trim()
          if (token.startsWith('sk-ant-')) {
            anthropicKey = token
            console.log('\n✓ Token generated successfully!')
          } else {
            console.log('\nToken generation returned unexpected output.')
            const manual = await ask('Paste your token manually (starts with sk-ant-oat01-): ')
            anthropicKey = manual.trim()
          }
        } catch {
          console.log('\nToken generation failed or was cancelled.')
          const manual = await ask('Paste your token manually (starts with sk-ant-oat01-), or press Enter to skip: ')
          anthropicKey = manual.trim()
        }
      } else {
        console.log('\nWithout Claude Code CLI, paste your OAuth token directly.')
        console.log('To get one later: npm install -g @anthropic-ai/claude-code && claude setup-token\n')
        const manual = await ask('Paste token (or press Enter to skip): ')
        anthropicKey = manual.trim()
      }
    } else {
      console.log('\nGet an API key at: https://console.anthropic.com/settings/keys\n')
      const key = await ask('Anthropic API key (starts with sk-ant-): ')
      anthropicKey = key.trim()
    }

    // ---- Step 2: GitHub Token ----
    console.log('\n━━━ Step 2: GitHub Token (for coding pipeline) ━━━\n')
    console.log('Required to create branches and PRs. Get one at:')
    console.log('https://github.com/settings/tokens/new?scopes=repo\n')
    const githubToken = (await ask('GitHub token (or press Enter to skip): ')).trim()

    // ---- Step 3: Default Model ----
    console.log('\n━━━ Step 3: Default Model ━━━\n')
    console.log('Available models:')
    console.log('  1) claude-sonnet-4  (recommended — fast + capable)')
    console.log('  2) claude-opus-4    (most capable — slower, more expensive)')
    console.log('  3) claude-haiku-4   (fastest — cheapest)\n')
    const modelChoice = (await ask('Choose [1/2/3] (default: 1): ')).trim()
    const modelMap: Record<string, string> = {
      '1': 'claude-sonnet-4-20250514',
      '2': 'claude-opus-4-20250514',
      '3': 'claude-haiku-4-20250514',
    }
    const defaultModel = modelMap[modelChoice] ?? 'claude-sonnet-4-20250514'

    // ---- Step 4: Cost Budget ----
    console.log('\n━━━ Step 4: Cost Budget ━━━\n')
    console.log('Set a per-task spending limit (0 = unlimited).')
    if (authChoice.trim() === '1') {
      console.log('Since you\'re using a subscription, costs count against your plan limits.\n')
    }
    const budget = (await ask('Budget per task in USD (default: 0): ')).trim()
    const costBudget = parseFloat(budget) || 0

    // ---- Write .env file ----
    const envLines: string[] = ['# Blade Super Agent Configuration', '']

    if (anthropicKey) {
      envLines.push(`ANTHROPIC_API_KEY=${anthropicKey}`)
    }
    if (githubToken) {
      envLines.push(`GITHUB_TOKEN=${githubToken}`)
    }
    envLines.push(`PORT=3000`)
    envLines.push('')

    // Check for existing .env and merge
    if (existsSync(envPath)) {
      const existing = readFileSync(envPath, 'utf-8')
      const existingKeys = new Set(
        existing.split('\n')
          .filter(l => l.includes('=') && !l.startsWith('#'))
          .map(l => l.split('=')[0])
      )
      // Add any keys from existing that we didn't set
      for (const line of existing.split('\n')) {
        if (line.includes('=') && !line.startsWith('#')) {
          const key = line.split('=')[0]
          if (!envLines.some(l => l.startsWith(`${key}=`))) {
            envLines.push(line)
          }
        }
      }
    }

    writeFileSync(envPath, envLines.join('\n') + '\n')
    console.log(`\n✓ Saved .env to ${envPath}`)

    // ---- Write config ----
    mkdirSync(bladeDir, { recursive: true })
    const config = {
      defaultModel,
      codingModel: defaultModel,
      costBudget,
      maxIterations: 25,
      port: 3000,
    }
    writeFileSync(join(bladeDir, 'config.json'), JSON.stringify(config, null, 2) + '\n')
    console.log(`✓ Saved config to ${join(bladeDir, 'config.json')}`)

    // ---- Initialize DB ----
    initializeDb()
    console.log('✓ Database initialized')

    // ---- Summary ----
    console.log('\n━━━ Setup Complete! ━━━\n')
    console.log('You can now:')
    console.log('  blade chat              — Chat with Blade')
    console.log('  blade code "task" --repo=url  — Give Blade a coding task')
    console.log('  blade jobs              — View coding jobs')
    console.log('  blade memory            — View stored memories')
    console.log('  blade costs             — View spending')
    if (!anthropicKey) {
      console.log('\n⚠️  No API key configured. Run `blade setup` again to add one.')
    }
    console.log('')

    rl.close()
  })

// ============================================================
// START COMMAND
// ============================================================

program
  .command('start')
  .description('Start the Blade dashboard (Next.js dev server)')
  .action(async () => {
    // Detect the correct path to apps/web
    const candidates = [
      join(process.cwd(), 'apps', 'web'),
      join(process.cwd(), '..', 'apps', 'web'),
      join(__dirname, '..', '..', '..', 'apps', 'web'),
    ]

    let webDir: string | undefined
    for (const candidate of candidates) {
      if (existsSync(join(candidate, 'package.json'))) {
        webDir = candidate
        break
      }
    }

    if (!webDir) {
      console.error('Could not find apps/web directory. Run this from the project root.')
      process.exit(1)
    }

    console.log('\nBlade dashboard starting at http://localhost:3000\n')

    const child = spawn('npx', ['next', 'dev'], {
      cwd: webDir,
      stdio: 'inherit',
      shell: true,
    })

    process.on('SIGINT', () => {
      child.kill('SIGINT')
      process.exit(0)
    })

    process.on('SIGTERM', () => {
      child.kill('SIGTERM')
      process.exit(0)
    })

    child.on('exit', (code) => {
      process.exit(code ?? 0)
    })
  })

// ============================================================
// DOCTOR COMMAND
// ============================================================

program
  .command('doctor')
  .description('Check system dependencies and configuration')
  .action(async () => {
    console.log('\n⚔️  Blade Doctor — System Check\n')

    let passed = 0
    const total = 6

    // 1. Node.js version (need 20+)
    const nodeVersion = process.versions.node
    const nodeMajor = parseInt(nodeVersion.split('.')[0], 10)
    if (nodeMajor >= 20) {
      console.log(`  ✅ Node.js v${nodeVersion} (20+ required)`)
      passed++
    } else {
      console.log(`  ❌ Node.js v${nodeVersion} (20+ required)`)
    }

    // 2. Anthropic API key
    if (process.env.ANTHROPIC_API_KEY) {
      console.log('  ✅ Anthropic API key configured')
      passed++
    } else {
      console.log('  ❌ Anthropic API key not set (ANTHROPIC_API_KEY)')
    }

    // 3. GitHub token
    if (process.env.GITHUB_TOKEN) {
      console.log('  ✅ GitHub token configured')
      passed++
    } else {
      console.log('  ❌ GitHub token not set (GITHUB_TOKEN)')
    }

    // 4. Docker available
    try {
      execSync('docker info', { stdio: 'pipe' })
      console.log('  ✅ Docker available')
      passed++
    } catch {
      console.log('  ❌ Docker not available')
    }

    // 5. Database accessible
    try {
      initializeDb()
      console.log('  ✅ Database accessible')
      passed++
    } catch {
      console.log('  ❌ Database not accessible')
    }

    // 6. Web search configured
    const hasWebSearch =
      !!process.env.TAVILY_API_KEY ||
      !!process.env.SERPAPI_API_KEY ||
      !!process.env.EXA_API_KEY
    if (hasWebSearch) {
      console.log('  ✅ Web search configured')
      passed++
    } else {
      console.log('  ❌ Web search not configured (TAVILY_API_KEY / SERPAPI_API_KEY / EXA_API_KEY)')
    }

    console.log(`\n  ${passed}/${total} checks passed\n`)
  })

// ============================================================
// TELEGRAM COMMAND
// ============================================================

program
  .command('telegram')
  .description('Start the Telegram bot integration')
  .action(async () => {
    const token = process.env.TELEGRAM_BOT_TOKEN
    if (!token) {
      console.error('❌ TELEGRAM_BOT_TOKEN environment variable is required.')
      console.error('   Get one from @BotFather on Telegram, then add it to your .env file.')
      process.exit(1)
    }

    const allowedChatIds = process.env.TELEGRAM_ALLOWED_CHAT_IDS
      ? process.env.TELEGRAM_ALLOWED_CHAT_IDS.split(',').map(id => id.trim()).filter(Boolean)
      : undefined

    const { startTelegramBot } = await import('@blade/conversation')
    startTelegramBot(token, allowedChatIds)

    console.log('\n⚔️  Blade Telegram Bot')
    console.log('   Telegram bot running. Send a message to your bot.')
    if (allowedChatIds && allowedChatIds.length > 0) {
      console.log(`   Allowed chat IDs: ${allowedChatIds.join(', ')}`)
    } else {
      console.log('   All chats allowed (no TELEGRAM_ALLOWED_CHAT_IDS set)')
    }
    console.log('   Press Ctrl+C to stop.\n')

    // Keep the process alive
    process.on('SIGINT', () => {
      console.log('\nTelegram bot stopped.')
      process.exit(0)
    })

    process.on('SIGTERM', () => {
      console.log('\nTelegram bot stopped.')
      process.exit(0)
    })
  })

program
  .command('slack')
  .description('Start the Slack bot integration (Socket Mode)')
  .action(async () => {
    if (!process.env.SLACK_ACCESS_TOKEN) {
      console.error('❌ SLACK_ACCESS_TOKEN is required. Add your xoxb- bot token to .env.')
      process.exit(1)
    }
    if (!process.env.SLACK_APP_TOKEN) {
      console.error('❌ SLACK_APP_TOKEN is required. Enable Socket Mode in your Slack app and generate an xapp- token.')
      process.exit(1)
    }

    const { startSlackBot } = await import('@blade/conversation')
    await startSlackBot()

    console.log('\n⚔️  Blade Slack Bot')
    console.log('   Slack bot running (Socket Mode). @mention the bot or DM it.')
    console.log('   Press Ctrl+C to stop.\n')

    process.on('SIGINT', () => { console.log('\nSlack bot stopped.'); process.exit(0) })
    process.on('SIGTERM', () => { console.log('\nSlack bot stopped.'); process.exit(0) })
  })

// ============================================================
// TEAM COMMAND
// ============================================================

program
  .command('team')
  .description('List active employees with status')
  .action(async () => {
    initializeDb()

    // Load built-in employee definitions
    // Employee definitions are loaded via @blade/core's side-effect imports

    const active = getActiveEmployees()

    if (active.length === 0) {
      console.log('\nNo team members yet. Run `blade setup` or visit the dashboard.\n')
      return
    }

    console.log('\n  BLADE TEAM\n')
    console.log('  ' + '-'.repeat(70))
    console.log('  ' + 'Name'.padEnd(20) + 'Role'.padEnd(20) + 'Status'.padEnd(15) + 'Since')
    console.log('  ' + '-'.repeat(70))

    for (const member of active) {
      const def = getEmployee(member.employeeId)
      if (!def) continue

      const entries = getScorecard(member.employeeId)
      const redCount = entries.filter(e => e.status === 'red').length
      const yellowCount = entries.filter(e => e.status === 'yellow').length

      let statusLabel: string
      if (redCount > 0) {
        statusLabel = `[R] ${redCount} alert(s)`
      } else if (yellowCount > 0) {
        statusLabel = `[Y] ${yellowCount} warn`
      } else if (entries.length > 0) {
        statusLabel = '[G] On track'
      } else {
        statusLabel = '[ ] No data'
      }

      const since = new Date(member.activatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

      console.log(
        '  ' +
        `${def.icon} ${def.name}`.padEnd(20) +
        def.title.padEnd(20) +
        statusLabel.padEnd(15) +
        since
      )
    }

    console.log('  ' + '-'.repeat(70))
    console.log(`\n  ${active.length} active employee(s)\n`)
  })

// ============================================================
// BRIEFING COMMAND
// ============================================================

program
  .command('briefing')
  .description('Generate a morning briefing for all active employees')
  .action(async () => {
    initializeDb()

    // Load built-in employee definitions
    // Employee definitions are loaded via @blade/core's side-effect imports

    const active = getActiveEmployees()

    if (active.length === 0) {
      console.log('\nNo active employees. Activate employees first via the dashboard or `blade setup`.\n')
      return
    }

    const briefing = await generateMorningBriefing(active)
    console.log('\n' + briefing + '\n')
  })

// ============================================================
// SCORECARD COMMAND
// ============================================================

program
  .command('scorecard')
  .description('Show scorecard for all active employees as a stoplight table')
  .action(async () => {
    initializeDb()

    // Load built-in employee definitions
    // Employee definitions are loaded via @blade/core's side-effect imports

    const active = getActiveEmployees()

    if (active.length === 0) {
      console.log('\nNo active employees. Activate employees first via the dashboard or `blade setup`.\n')
      return
    }

    console.log('\n  EMPLOYEE SCORECARDS\n')

    for (const member of active) {
      const def = getEmployee(member.employeeId)
      if (!def) continue

      const entries = getScorecard(member.employeeId)

      console.log(`  ${def.icon} ${def.name} — ${def.title}`)
      console.log('  ' + '-'.repeat(60))

      if (entries.length === 0 && def.scorecardMetrics.length === 0) {
        console.log('    No scorecard metrics defined.')
        console.log('')
        continue
      }

      const scorecardOutput = formatScorecard(entries, def)
      console.log(scorecardOutput)
      console.log('')
    }
  })

// ============================================================
// EVOLVE COMMAND
// ============================================================

program
  .command('evolve')
  .description('Run one self-evolution cycle — analyze failures, optimize skills, discover tools')
  .action(async () => {
    initializeDb()

    console.log('\n  BLADE EVOLUTION CYCLE\n')
    console.log('  Analyzing failures, optimizing skills, discovering tools...\n')

    const { runEvolutionCycle } = await import('@blade/core')
    const events = await runEvolutionCycle()

    if (events.length === 0) {
      console.log('  No evolution events this cycle. Use Blade more to generate data.\n')
      return
    }

    const typeEmoji: Record<string, string> = {
      skill_improved: '🔧',
      new_skill_created: '✨',
      tool_discovered: '🔍',
      prompt_optimized: '📝',
      pattern_learned: '🧠',
    }

    for (const event of events) {
      const emoji = typeEmoji[event.type] ?? '📌'
      console.log(`  ${emoji} [${event.type}]`)
      console.log(`     ${event.description}`)
      if (event.impact) {
        console.log(`     Impact: ${event.impact}`)
      }
      console.log('')
    }

    console.log(`  ${events.length} evolution event(s) recorded.\n`)
  })

// ============================================================
// REPORT COMMAND
// ============================================================

program
  .command('report')
  .description('Generate a usage/value report showing what Blade has learned about you')
  .action(async () => {
    initializeDb()

    const { generateUsageReport } = await import('@blade/core')
    const report = generateUsageReport()

    console.log('\n  ⚔️  BLADE VALUE REPORT\n')
    console.log('  ' + '═'.repeat(55))
    console.log('')
    console.log(`  Level:              ${report.level}`)
    console.log(`  Streak:             ${report.streakDays} day(s)`)
    console.log('')
    console.log('  ' + '─'.repeat(55))
    console.log('  KNOWLEDGE BASE')
    console.log('  ' + '─'.repeat(55))
    console.log(`  Conversations:      ${report.totalConversations}`)
    console.log(`  Tool calls:         ${report.totalToolCalls}`)
    console.log(`  Memories stored:    ${report.totalMemories}`)
    console.log(`  Skills learned:     ${report.totalSkillsLearned}`)
    console.log(`  Evolution events:   ${report.totalEvolutionEvents}`)

    if (report.topSkills.length > 0) {
      console.log('')
      console.log('  ' + '─'.repeat(55))
      console.log('  TOP SKILLS')
      console.log('  ' + '─'.repeat(55))
      for (const skill of report.topSkills) {
        console.log(`  ${skill.name.padEnd(30)} ${skill.uses} uses`)
      }
    }

    if (report.topTools.length > 0) {
      console.log('')
      console.log('  ' + '─'.repeat(55))
      console.log('  TOP TOOLS')
      console.log('  ' + '─'.repeat(55))
      for (const tool of report.topTools) {
        console.log(`  ${tool.name.padEnd(30)} ${tool.uses} calls`)
      }
    }

    console.log('')
    console.log('  ' + '═'.repeat(55))
    console.log(`  💡 ${report.uniqueInsight}`)
    console.log('  ' + '═'.repeat(55))
    console.log('')
  })

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
// CODE COMMAND
// ============================================================

program
  .command('code')
  .description('Give Blade a coding task — clones, codes, tests, and opens a PR')
  .argument('<task>', 'Task description (e.g. "Add a health check endpoint")')
  .requiredOption('--repo <url>', 'Repository URL or local path')
  .option('--branch <branch>', 'Base branch', 'main')
  .option('--model <model>', 'Model to use')
  .option('--budget <usd>', 'Cost budget in USD (0 = unlimited)', '0')
  .action(async (task: string, opts: { repo: string; branch: string; model?: string; budget: string }) => {
    const db = initializeDb()
    const config = loadConfig()

    const model = opts.model ?? config.codingModel
    const budget = parseFloat(opts.budget)

    // Create a job record
    const branchName = `blade/${Date.now()}`
    const job = jobs.create({
      title: task.slice(0, 120),
      description: task,
      repoUrl: opts.repo,
      branch: branchName,
      baseBranch: opts.branch,
      agentModel: model,
    })

    console.log(`\n⚔️  Blade Code — Job created: ${job.id}\n`)
    console.log(`  Task:   ${task}`)
    console.log(`  Repo:   ${opts.repo}`)
    console.log(`  Branch: ${opts.branch}`)
    console.log(`  Model:  ${model}`)
    console.log('')

    const statusEmoji: Record<string, string> = {
      cloning: '📦',
      branching: '🌿',
      container_starting: '🐳',
      coding: '💻',
      testing: '🧪',
      pr_creating: '📝',
      completed: '✅',
      failed: '❌',
    }

    try {
      const { runCodingPipeline } = await import('@blade/core')

      const githubToken = process.env.GITHUB_TOKEN ?? ''

      const result = await runCodingPipeline({
        jobId: job.id,
        title: task.slice(0, 120),
        description: task,
        repoUrl: opts.repo,
        baseBranch: opts.branch,
        agentModel: model,
        githubToken,
        onStatus: (status: string, message: string) => {
          const emoji = statusEmoji[status] ?? '⏳'
          console.log(`  ${emoji} ${message}`)
          jobLogs.add(job.id, 'info', `[${status}] ${message}`)
        },
      })

      jobs.updateStatus(job.id, 'completed', {
        prUrl: result.prUrl,
        prNumber: result.prNumber,
        totalCostUsd: result.totalCost,
        completedAt: new Date().toISOString(),
      })

      console.log('')
      console.log(`  ✅ Done!`)
      if (result.prUrl) {
        console.log(`  📎 PR: ${result.prUrl}`)
      }
      console.log(`  💰 Cost: $${result.totalCost.toFixed(4)}`)
      console.log('')
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      jobs.updateStatus(job.id, 'failed', { error: errorMessage })
      jobLogs.add(job.id, 'error', errorMessage)
      console.error(`\n  ❌ Failed: ${errorMessage}\n`)
      process.exit(1)
    }
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

// Default action: if no command given, run setup if not configured, otherwise chat
program.action(() => {
  const envPath = join(process.cwd(), '.env')
  const hasEnv = existsSync(envPath) && readFileSync(envPath, 'utf-8').includes('ANTHROPIC_API_KEY=')

  if (!hasEnv) {
    program.commands.find(c => c.name() === 'setup')?.parseAsync([])
  } else {
    program.commands.find(c => c.name() === 'chat')?.parseAsync([])
  }
})

program.parse()
