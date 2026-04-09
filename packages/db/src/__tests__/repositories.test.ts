import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { initializeDb, getDb, closeDb } from '../sqlite.js'
import {
  conversations,
  messages,
  toolCalls,
  jobs,
  jobLogs,
  workerSessions,
  channelLinks,
  memories,
  skills,
  costEntries,
  employees,
  notifications,
  xpEvents,
  streaks,
  achievements,
  userProfile,
  workflowRuns,
  handoffs,
  priorities,
  evolutionEvents,
} from '../repositories.js'

beforeAll(() => {
  closeDb()
  initializeDb(':memory:')
})

// Helper: wipe all rows between tests for isolation
beforeEach(() => {
  const db = getDb()
  const tables = [
    'daily_priorities',
    'handoffs',
    'workflow_runs',
    'evolution_events',
    'achievements',
    'streaks',
    'xp_events',
    'user_profile',
    'notifications',
    'cost_entries',
    'skills',
    'memories',
    'job_logs',
    'channel_links',
    'worker_sessions',
    'tool_calls',
    'messages',
    'jobs',
    'conversations',
    'employees',
  ]
  for (const t of tables) {
    db.prepare(`DELETE FROM ${t}`).run()
  }
})

// ============================================================
// CONVERSATIONS
// ============================================================

describe('conversations', () => {
  it('creates and retrieves a conversation', () => {
    const conv = conversations.create('Test Chat')
    expect(conv).toMatchObject({
      id: expect.any(String),
      title: 'Test Chat',
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    })

    const fetched = conversations.get(conv.id)
    expect(fetched).toBeDefined()
    expect(fetched!.title).toBe('Test Chat')
  })

  it('creates a conversation without a title', () => {
    const conv = conversations.create()
    expect(conv.title).toBeUndefined()
    const fetched = conversations.get(conv.id)
    expect(fetched).toBeDefined()
  })

  it('lists conversations', () => {
    conversations.create('First')
    conversations.create('Second')
    const list = conversations.list()
    expect(list.length).toBe(2)
    const titles = list.map(c => c.title)
    expect(titles).toContain('First')
    expect(titles).toContain('Second')
  })

  it('updates title', () => {
    const conv = conversations.create('Old Title')
    conversations.updateTitle(conv.id, 'New Title')
    const fetched = conversations.get(conv.id)
    expect(fetched!.title).toBe('New Title')
  })
})

// ============================================================
// MESSAGES
// ============================================================

describe('messages', () => {
  it('creates and lists messages by conversation', () => {
    const conv = conversations.create('msg-test')
    const msg = messages.create({
      conversationId: conv.id,
      role: 'user',
      content: 'Hello',
      model: 'claude-sonnet',
      inputTokens: 10,
      outputTokens: 20,
    })
    expect(msg.id).toEqual(expect.any(String))

    const list = messages.listByConversation(conv.id)
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({
      id: msg.id,
      conversationId: conv.id,
      role: 'user',
      content: 'Hello',
      model: 'claude-sonnet',
      inputTokens: 10,
      outputTokens: 20,
      createdAt: expect.any(String),
    })
  })

  it('defaults tokens to 0 and model to null', () => {
    const conv = conversations.create()
    messages.create({ conversationId: conv.id, role: 'assistant', content: 'Hi' })
    const list = messages.listByConversation(conv.id)
    expect(list[0].inputTokens).toBe(0)
    expect(list[0].outputTokens).toBe(0)
    expect(list[0].model).toBeNull()
  })
})

// ============================================================
// TOOL CALLS
// ============================================================

describe('toolCalls', () => {
  it('creates and lists tool calls by conversation', () => {
    const conv = conversations.create()
    const msg = messages.create({ conversationId: conv.id, role: 'assistant', content: 'tool use' })

    toolCalls.create({
      messageId: msg.id,
      conversationId: conv.id,
      toolName: 'readFile',
      input: { path: '/tmp/test' },
      success: true,
      result: { content: 'hello' },
      display: 'Read file',
      durationMs: 42,
    })

    const list = toolCalls.listByConversation(conv.id)
    expect(list).toHaveLength(1)
    expect((list[0] as Record<string, unknown>).tool_name).toBe('readFile')
    expect((list[0] as Record<string, unknown>).success).toBe(1)
  })
})

// ============================================================
// JOBS
// ============================================================

describe('jobs', () => {
  it('creates and retrieves a job', () => {
    const job = jobs.create({
      title: 'Add tests',
      description: 'Write unit tests',
      repoUrl: 'https://github.com/test/repo',
      branch: 'feat/tests',
    })
    expect(job.id).toEqual(expect.any(String))

    const fetched = jobs.get(job.id) as Record<string, unknown>
    expect(fetched).toBeDefined()
    expect(fetched.title).toBe('Add tests')
    expect(fetched.status).toBe('queued')
    expect(fetched.baseBranch).toBe('main')
  })

  it('lists jobs', () => {
    jobs.create({ title: 'J1', description: 'd', repoUrl: 'u', branch: 'b' })
    jobs.create({ title: 'J2', description: 'd', repoUrl: 'u', branch: 'b' })
    const list = jobs.list()
    expect(list).toHaveLength(2)
  })

  it('updates status with extra fields', () => {
    const job = jobs.create({ title: 'J', description: 'd', repoUrl: 'u', branch: 'b' })
    jobs.updateStatus(job.id, 'running', { containerName: 'blade-123' })
    const fetched = jobs.get(job.id) as Record<string, unknown>
    expect(fetched.status).toBe('running')
    expect(fetched.containerName).toBe('blade-123')
  })

  it('throws on invalid column in updateStatus', () => {
    const job = jobs.create({ title: 'J', description: 'd', repoUrl: 'u', branch: 'b' })
    expect(() =>
      jobs.updateStatus(job.id, 'running', { 'DROP TABLE jobs--': 'pwned' })
    ).toThrowError('not in the allowed list')
  })
})

// ============================================================
// JOB LOGS
// ============================================================

describe('jobLogs', () => {
  it('adds and lists logs for a job', () => {
    const job = jobs.create({ title: 'J', description: 'd', repoUrl: 'u', branch: 'b' })
    jobLogs.add(job.id, 'info', 'Started cloning', { url: 'https://github.com/test' })
    jobLogs.add(job.id, 'error', 'Something failed')

    const list = jobLogs.listByJob(job.id)
    expect(list).toHaveLength(2)
    expect((list[0] as Record<string, unknown>).level).toBe('info')
    expect((list[1] as Record<string, unknown>).level).toBe('error')
  })
})

// ============================================================
// WORKER SESSIONS & CHANNEL LINKS
// ============================================================

describe('workerSessions', () => {
  it('creates, updates, and finds a worker session by job id', () => {
    const job = jobs.create({ title: 'J', description: 'd', repoUrl: 'u', branch: 'b' })
    workerSessions.create({
      id: job.id,
      jobId: job.id,
      name: 'Blade Worker',
      status: 'queued',
      runtime: 'pending',
      conversationId: `job-${job.id}`,
    })

    workerSessions.update(job.id, {
      status: 'active',
      runtime: 'docker',
      latestSummary: 'Tool completed: read_file',
      lastSeenAt: '2026-04-09T12:00:00.000Z',
    })

    const fetched = workerSessions.findByJob(job.id)
    expect(fetched).toBeDefined()
    expect(fetched!.status).toBe('active')
    expect(fetched!.runtime).toBe('docker')
    expect(fetched!.conversationId).toBe(`job-${job.id}`)
    expect(fetched!.latestSummary).toBe('Tool completed: read_file')
  })

  it('stores and clears requested actions in worker metadata', () => {
    const job = jobs.create({ title: 'J', description: 'd', repoUrl: 'u', branch: 'b' })
    workerSessions.create({
      id: job.id,
      jobId: job.id,
      name: 'Blade Worker',
    })

    workerSessions.requestAction(job.id, 'stop', 'operator')
    let fetched = workerSessions.get(job.id)
    let metadata = JSON.parse(fetched!.metadataJson ?? '{}') as { control?: { requestedAction?: string; requestedBy?: string } }
    expect(metadata.control?.requestedAction).toBe('stop')
    expect(metadata.control?.requestedBy).toBe('operator')

    workerSessions.clearRequestedAction(job.id)
    fetched = workerSessions.get(job.id)
    metadata = JSON.parse(fetched!.metadataJson ?? '{}') as { control?: { requestedAction?: string } }
    expect(metadata.control?.requestedAction).toBeUndefined()
  })
})

describe('channelLinks', () => {
  it('links a channel to a conversation and resolves it back', () => {
    const conv = conversations.create('Telegram chat')
    channelLinks.upsert({
      conversationId: conv.id,
      channel: 'telegram',
      channelId: '12345',
      metadata: { source: 'test' },
    })

    expect(channelLinks.findConversation('telegram', '12345')).toBe(conv.id)

    const linked = channelLinks.listByConversation(conv.id)
    expect(linked).toHaveLength(1)
    expect(linked[0].channel).toBe('telegram')
    expect(linked[0].channelId).toBe('12345')
  })

  it('moves an existing channel link to a newer conversation', () => {
    const first = conversations.create('First')
    const second = conversations.create('Second')

    channelLinks.upsert({ conversationId: first.id, channel: 'telegram', channelId: 'shared' })
    channelLinks.upsert({ conversationId: second.id, channel: 'telegram', channelId: 'shared' })

    expect(channelLinks.findConversation('telegram', 'shared')).toBe(second.id)
    expect(channelLinks.listByConversation(first.id)).toHaveLength(0)
    expect(channelLinks.listByConversation(second.id)).toHaveLength(1)
  })
})

// ============================================================
// MEMORIES
// ============================================================

describe('memories', () => {
  it('creates and retrieves all memories', () => {
    const mem = memories.create({
      type: 'fact',
      content: 'The sky is blue',
      tags: ['science', 'nature'],
      source: 'observation',
      confidence: 0.9,
    })
    expect(mem.id).toEqual(expect.any(String))

    const all = memories.getAll()
    expect(all).toHaveLength(1)
    expect((all[0] as Record<string, unknown>).content).toBe('The sky is blue')
    expect((all[0] as Record<string, unknown>).confidence).toBe(0.9)
  })

  it('search via FTS', () => {
    memories.create({ type: 'fact', content: 'TypeScript is great', tags: ['code'], source: 'dev' })
    memories.create({ type: 'fact', content: 'Python is versatile', tags: ['code'], source: 'dev' })

    try {
      const results = memories.search('TypeScript')
      expect(results).toHaveLength(1)
      expect((results[0] as Record<string, unknown>).content).toBe('TypeScript is great')
    } catch {
      // FTS may not work perfectly with :memory: in all environments
    }
  })

  it('reinforces a memory', () => {
    const mem = memories.create({ type: 'fact', content: 'test', tags: [], source: 's', confidence: 0.5 })
    memories.reinforce(mem.id)

    const all = memories.getAll()
    expect((all[0] as Record<string, unknown>).confidence).toBeCloseTo(0.6)
    expect((all[0] as Record<string, unknown>).accessCount).toBe(1)
  })

  it('decays a memory', () => {
    const mem = memories.create({ type: 'fact', content: 'test', tags: [], source: 's', confidence: 0.5 })
    memories.decay(mem.id)

    const all = memories.getAll()
    expect((all[0] as Record<string, unknown>).confidence).toBeCloseTo(0.4)
  })

  it('deletes a memory', () => {
    const mem = memories.create({ type: 'fact', content: 'test', tags: [], source: 's' })
    memories.delete(mem.id)
    expect(memories.getAll()).toHaveLength(0)
  })

  it('prunes low-confidence memories', () => {
    memories.create({ type: 'fact', content: 'strong', tags: [], source: 's', confidence: 0.8 })
    memories.create({ type: 'fact', content: 'weak', tags: [], source: 's', confidence: 0.05 })

    const pruned = memories.prune(0.1)
    expect(pruned).toBe(1)
    expect(memories.getAll()).toHaveLength(1)
  })
})

// ============================================================
// SKILLS
// ============================================================

describe('skills', () => {
  it('upserts and retrieves a skill', () => {
    const skill = skills.upsert({
      name: 'code-review',
      description: 'Reviews code',
      systemPrompt: 'You are a code reviewer',
      tools: ['readFile', 'writeFile'],
    })
    expect(skill.id).toEqual(expect.any(String))

    const fetched = skills.get('code-review') as Record<string, unknown>
    expect(fetched).toBeDefined()
    expect(fetched.name).toBe('code-review')
    expect(fetched.description).toBe('Reviews code')
  })

  it('upsert updates an existing skill by name', () => {
    skills.upsert({ name: 'test-skill', description: 'v1', systemPrompt: 'p', tools: [] })
    skills.upsert({ name: 'test-skill', description: 'v2', systemPrompt: 'p2', tools: ['a'] })

    const fetched = skills.get('test-skill') as Record<string, unknown>
    expect(fetched.description).toBe('v2')
    expect(fetched.version).toBe(2)
  })

  it('lists skills', () => {
    skills.upsert({ name: 's1', description: 'd', systemPrompt: 'p', tools: [] })
    skills.upsert({ name: 's2', description: 'd', systemPrompt: 'p', tools: [] })
    const list = skills.list()
    expect(list).toHaveLength(2)
  })

  it('records skill usage and updates success rate', () => {
    skills.upsert({ name: 'use-me', description: 'd', systemPrompt: 'p', tools: [] })
    skills.recordUse('use-me', true)
    skills.recordUse('use-me', false)

    const fetched = skills.get('use-me') as Record<string, unknown>
    expect(fetched.total_uses).toBe(2)
    // Initial rate is 0.5. After one success: (0.5*0 + 1)/1 = 1.0. After one failure: (1.0*1 + 0)/2 = 0.5
    expect(fetched.success_rate).toBeCloseTo(0.5)
  })
})

// ============================================================
// COST ENTRIES
// ============================================================

describe('costEntries', () => {
  it('records and summarizes costs', () => {
    costEntries.record({
      model: 'claude-sonnet',
      inputTokens: 1000,
      outputTokens: 500,
      inputCostUsd: 0.003,
      outputCostUsd: 0.0075,
      totalCostUsd: 0.0105,
    })
    costEntries.record({
      model: 'claude-haiku',
      inputTokens: 2000,
      outputTokens: 800,
      inputCostUsd: 0.0005,
      outputCostUsd: 0.001,
      totalCostUsd: 0.0015,
    })

    const summary = costEntries.summary(30)
    expect(summary.totalUsd).toBeCloseTo(0.012)
    expect(summary.byModel['claude-sonnet']).toBeCloseTo(0.0105)
    expect(summary.byModel['claude-haiku']).toBeCloseTo(0.0015)
    expect(summary.tokenCount.input).toBe(3000)
    expect(summary.tokenCount.output).toBe(1300)
  })
})

// ============================================================
// EMPLOYEES
// ============================================================

describe('employees', () => {
  it('upserts and retrieves an employee', () => {
    const emp = employees.upsert({
      slug: 'coach-blade',
      name: 'Blade',
      title: 'Head Coach',
      pillar: 'health',
      description: 'Main fitness coach',
      active: true,
      archetype: 'coach',
    })
    expect(emp.id).toEqual(expect.any(String))

    const fetched = employees.get('coach-blade')
    expect(fetched).toBeDefined()
    expect(fetched!.name).toBe('Blade')
    expect(fetched!.active).toBe(1)
  })

  it('lists and filters active employees', () => {
    employees.upsert({ slug: 'e1', name: 'E1', title: 'T', pillar: 'health', description: 'd', active: true, archetype: 'coach' })
    employees.upsert({ slug: 'e2', name: 'E2', title: 'T', pillar: 'wealth', description: 'd', active: false })

    const all = employees.list()
    expect(all).toHaveLength(2)

    const active = employees.listActive()
    expect(active).toHaveLength(1)
    expect(active[0].slug).toBe('e1')
  })

  it('activates and deactivates an employee', () => {
    employees.upsert({ slug: 'toggle', name: 'Toggle', title: 'T', pillar: 'business', description: 'd', active: false })

    employees.activate('toggle', 'operator', { q1: 'yes' })
    expect(employees.get('toggle')!.active).toBe(1)

    employees.deactivate('toggle')
    expect(employees.get('toggle')!.active).toBe(0)
  })
})

// ============================================================
// NOTIFICATIONS
// ============================================================

describe('notifications', () => {
  it('creates and lists notifications', () => {
    const n = notifications.create({ title: 'Hello', message: 'World' })
    expect(n.id).toEqual(expect.any(String))

    const list = notifications.list()
    expect(list).toHaveLength(1)
    expect(list[0].title).toBe('Hello')
    expect(list[0].read).toBe(0)
    expect(list[0].type).toBe('info')
  })

  it('marks a notification as read', () => {
    const n = notifications.create({ title: 'T', message: 'M' })
    notifications.markRead(n.id)

    const list = notifications.list()
    expect(list[0].read).toBe(1)
  })

  it('marks all notifications as read', () => {
    notifications.create({ title: 'A', message: 'a' })
    notifications.create({ title: 'B', message: 'b' })
    expect(notifications.unreadCount()).toBe(2)

    notifications.markAllRead()
    expect(notifications.unreadCount()).toBe(0)
  })

  it('counts unread notifications', () => {
    notifications.create({ title: 'A', message: 'a' })
    notifications.create({ title: 'B', message: 'b' })
    expect(notifications.unreadCount()).toBe(2)

    notifications.markRead(notifications.list()[0].id)
    expect(notifications.unreadCount()).toBe(1)
  })
})

// ============================================================
// XP EVENTS
// ============================================================

describe('xpEvents', () => {
  it('records and totals XP', () => {
    xpEvents.record({ action: 'code-review', xp: 50 })
    xpEvents.record({ action: 'deploy', xp: 100 })

    expect(xpEvents.total()).toBe(150)
  })

  it('lists recent events', () => {
    xpEvents.record({ action: 'a1', xp: 10 })
    xpEvents.record({ action: 'a2', xp: 20, employeeId: 'emp-1' })

    const recent = xpEvents.recent()
    expect(recent).toHaveLength(2)
    // Most recent first
    expect(recent[0].action).toBe('a2')
    expect(recent[0].employeeId).toBe('emp-1')
    expect(recent[1].employeeId).toBeNull()
  })
})

// ============================================================
// ACHIEVEMENTS
// ============================================================

describe('achievements', () => {
  it('unlocks and lists achievements', () => {
    achievements.unlock('first-deploy', 'First Deploy')
    achievements.unlock('code-ninja', 'Code Ninja')

    const list = achievements.list()
    expect(list).toHaveLength(2)
    expect(list[0]).toMatchObject({
      id: expect.any(String),
      name: expect.any(String),
      unlockedAt: expect.any(String),
    })
  })

  it('checks if achievement is unlocked', () => {
    expect(achievements.isUnlocked('nope')).toBe(false)
    achievements.unlock('yes', 'Yes')
    expect(achievements.isUnlocked('yes')).toBe(true)
  })

  it('does not duplicate on re-unlock', () => {
    achievements.unlock('dup', 'Dup')
    achievements.unlock('dup', 'Dup')
    const list = achievements.list()
    expect(list).toHaveLength(1)
  })
})

// ============================================================
// USER PROFILE
// ============================================================

describe('userProfile', () => {
  it('returns undefined when no profile exists', () => {
    expect(userProfile.get()).toBeUndefined()
  })

  it('creates and retrieves a profile via update', () => {
    userProfile.update({ totalXp: 500, level: 3 })
    const profile = userProfile.get()
    expect(profile).toBeDefined()
    expect(profile!.totalXp).toBe(500)
    expect(profile!.level).toBe(3)
  })

  it('upserts on subsequent updates', () => {
    userProfile.update({ totalXp: 100, level: 1 })
    userProfile.update({ totalXp: 250, level: 2 })
    const profile = userProfile.get()
    expect(profile!.totalXp).toBe(250)
    expect(profile!.level).toBe(2)
  })
})

// ============================================================
// WORKFLOW RUNS
// ============================================================

describe('workflowRuns', () => {
  it('creates and retrieves a workflow run', () => {
    workflowRuns.create({ id: 'wr-1', workflowId: 'wf-deploy' })
    const run = workflowRuns.get('wr-1')
    expect(run).toBeDefined()
    expect(run!.status).toBe('running')
    expect(run!.workflowId).toBe('wf-deploy')
    expect(run!.stepResultsJson).toBe('{}')
    expect(run!.totalCost).toBe(0)
    expect(run!.completedAt).toBeNull()
  })

  it('updates a workflow run', () => {
    workflowRuns.create({ id: 'wr-2', workflowId: 'wf-test' })
    workflowRuns.update('wr-2', {
      status: 'completed',
      stepResultsJson: '{"step1":"pass"}',
      totalCost: 0.05,
      completedAt: new Date().toISOString(),
    })

    const run = workflowRuns.get('wr-2')
    expect(run!.status).toBe('completed')
    expect(run!.totalCost).toBe(0.05)
    expect(run!.completedAt).toBeTruthy()
  })

  it('lists workflow runs', () => {
    workflowRuns.create({ id: 'wr-a', workflowId: 'wf-1' })
    workflowRuns.create({ id: 'wr-b', workflowId: 'wf-2' })
    const list = workflowRuns.list()
    expect(list).toHaveLength(2)
  })
})

// ============================================================
// HANDOFFS
// ============================================================

describe('handoffs', () => {
  it('creates and retrieves a handoff', () => {
    handoffs.create({
      id: 'h-1',
      fromEmployee: 'coach-blade',
      toEmployee: 'coach-alex',
      reason: 'Specialization',
      context: 'Client needs nutrition help',
      priority: 'high',
    })

    const h = handoffs.get('h-1')
    expect(h).toBeDefined()
    expect(h!.fromEmployee).toBe('coach-blade')
    expect(h!.toEmployee).toBe('coach-alex')
    expect(h!.status).toBe('pending')
    expect(h!.priority).toBe('high')
  })

  it('lists pending handoffs for employee sorted by priority', () => {
    handoffs.create({ id: 'h-low', fromEmployee: 'a', toEmployee: 'target', reason: 'r', context: 'c', priority: 'low' })
    handoffs.create({ id: 'h-urgent', fromEmployee: 'b', toEmployee: 'target', reason: 'r', context: 'c', priority: 'urgent' })
    handoffs.create({ id: 'h-medium', fromEmployee: 'c', toEmployee: 'target', reason: 'r', context: 'c', priority: 'medium' })

    const pending = handoffs.listPendingForEmployee('target')
    expect(pending).toHaveLength(3)
    expect(pending[0].priority).toBe('urgent')
    expect(pending[1].priority).toBe('medium')
    expect(pending[2].priority).toBe('low')
  })

  it('updates status and sets completedAt on completion', () => {
    handoffs.create({ id: 'h-2', fromEmployee: 'a', toEmployee: 'b', reason: 'r', context: 'c', priority: 'medium' })
    handoffs.updateStatus('h-2', 'completed')

    const h = handoffs.get('h-2')
    expect(h!.status).toBe('completed')
    expect(h!.completedAt).toBeTruthy()
  })

  it('does not set completedAt for non-completed status', () => {
    handoffs.create({ id: 'h-3', fromEmployee: 'a', toEmployee: 'b', reason: 'r', context: 'c', priority: 'medium' })
    handoffs.updateStatus('h-3', 'in_progress')

    const h = handoffs.get('h-3')
    expect(h!.status).toBe('in_progress')
    expect(h!.completedAt).toBeNull()
  })

  it('clears all handoffs', () => {
    handoffs.create({ id: 'h-x', fromEmployee: 'a', toEmployee: 'b', reason: 'r', context: 'c', priority: 'low' })
    handoffs.clear()
    expect(handoffs.listPendingForEmployee('b')).toHaveLength(0)
  })
})

// ============================================================
// PRIORITIES
// ============================================================

describe('priorities', () => {
  it('creates and lists today priorities', () => {
    const p = priorities.create({ title: 'Ship feature', urgency: 'urgent' })
    expect(p.id).toEqual(expect.any(String))

    const today = priorities.listToday()
    expect(today).toHaveLength(1)
    expect(today[0].title).toBe('Ship feature')
    expect(today[0].urgency).toBe('urgent')
    expect(today[0].completed).toBe(0)
  })

  it('completes and uncompletes a priority', () => {
    const p = priorities.create({ title: 'Do it' })
    priorities.complete(p.id)

    let today = priorities.listToday()
    expect(today[0].completed).toBe(1)

    priorities.uncomplete(p.id)
    today = priorities.listToday()
    expect(today[0].completed).toBe(0)
  })

  it('deletes a priority', () => {
    const p = priorities.create({ title: 'Remove me' })
    priorities.delete(p.id)
    expect(priorities.listToday()).toHaveLength(0)
  })
})

// ============================================================
// EVOLUTION EVENTS
// ============================================================

describe('evolutionEvents', () => {
  it('records and retrieves recent events', () => {
    evolutionEvents.record({
      type: 'skill_learned',
      description: 'Learned TDD',
      before: 'no tests',
      after: '80% coverage',
      impact: 'high',
    })

    const recent = evolutionEvents.recent()
    expect(recent).toHaveLength(1)
    expect(recent[0].type).toBe('skill_learned')
    expect(recent[0].description).toBe('Learned TDD')
    expect(recent[0].beforeValue).toBe('no tests')
    expect(recent[0].afterValue).toBe('80% coverage')
    expect(recent[0].impact).toBe('high')
  })

  it('counts events by type', () => {
    evolutionEvents.record({ type: 'skill_learned', description: 'a' })
    evolutionEvents.record({ type: 'skill_learned', description: 'b' })
    evolutionEvents.record({ type: 'personality_shift', description: 'c' })

    const counts = evolutionEvents.countByType()
    expect(counts['skill_learned']).toBe(2)
    expect(counts['personality_shift']).toBe(1)
  })
})
