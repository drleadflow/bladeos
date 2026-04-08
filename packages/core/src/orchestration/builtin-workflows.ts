import { defineWorkflow } from './engine.js'

// New Lead Pipeline
defineWorkflow({
  id: 'new-lead-pipeline',
  name: 'New Lead Pipeline',
  description: 'When a new lead comes in: research → score → nurture or decline → update scorecard',
  trigger: 'webhook',
  steps: [
    {
      id: 'research',
      employeeId: 'closer',
      task: 'Research this new lead. Find their company, role, recent activity, and any mutual connections. Score them 1-5 based on fit.',
    },
    {
      id: 'nurture',
      employeeId: 'nurture-engine',
      task: 'Start a 7-day outbound nurture cadence for this lead. Draft the first 3 messages.',
      dependsOn: ['research'],
      condition: 'only if score > 3',
    },
    {
      id: 'decline',
      employeeId: 'support-rep',
      task: 'Send a polite, warm message to this lead thanking them for their interest. Keep the door open for future engagement.',
      dependsOn: ['research'],
      condition: 'only if score <= 3',
    },
    {
      id: 'update-scorecard',
      employeeId: 'operator',
      task: 'Update the pipeline scorecard with this new lead. Log whether they entered nurture or were declined.',
      dependsOn: ['nurture', 'decline'],
    },
  ],
})

// Content Launch
defineWorkflow({
  id: 'content-launch',
  name: 'Content Launch',
  description: 'Create content → adapt for 3 platforms → track on scorecard',
  trigger: 'manual',
  steps: [
    {
      id: 'create',
      employeeId: 'marketer',
      task: 'Write a high-value content piece based on the topic provided. Use the PAS framework. Make it actionable and specific.',
    },
    {
      id: 'social-posts',
      employeeId: 'marketer',
      task: 'Take the content from the previous step and create platform-native posts for LinkedIn, Twitter/X, and Instagram. Each should feel native to the platform, not copy-pasted.',
      dependsOn: ['create'],
    },
    {
      id: 'track',
      employeeId: 'operator',
      task: 'Log this content launch on the scorecard. Track: pieces published, platforms posted to, scheduled dates.',
      dependsOn: ['social-posts'],
    },
  ],
})

// Weekly Review
defineWorkflow({
  id: 'weekly-review',
  name: 'Weekly Review',
  description: 'Friday combined review: scorecard + Rule of 100 + habits + reflection → unified briefing',
  trigger: 'cron',
  steps: [
    {
      id: 'scorecard',
      employeeId: 'operator',
      task: 'Generate the weekly scorecard summary. Show red/yellow/green for all tracked metrics. Highlight the biggest wins and the biggest concerns.',
    },
    {
      id: 'wealth-check',
      employeeId: 'wealth-strategist',
      task: 'Report on this week\'s Rule of 100 performance, income vs target, savings rate, and any spending anomalies.',
    },
    {
      id: 'wellness-check',
      employeeId: 'wellness-coach',
      task: 'Report on this week\'s health habits: workout count, sleep average, habit streaks, stress indicators.',
    },
    {
      id: 'reflection',
      employeeId: 'reflector',
      task: 'Generate the weekly reflection: wins, lessons learned, growth moments, gratitude items, and intentions for next week. Include both business and personal dimensions.',
      dependsOn: ['scorecard', 'wealth-check', 'wellness-check'],
    },
  ],
})
