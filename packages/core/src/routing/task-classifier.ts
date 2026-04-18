export type TaskType =
  | 'coding' | 'research' | 'content' | 'outreach' | 'ops'
  | 'analytics' | 'design' | 'support' | 'strategy' | 'general'

const KEYWORDS: Record<TaskType, string[]> = {
  coding: ['build', 'code', 'fix', 'bug', 'implement', 'test', 'deploy', 'pr', 'merge', 'refactor', 'api', 'endpoint'],
  research: ['research', 'find', 'look into', 'investigate', 'analyze', 'compare', 'evaluate'],
  content: ['write', 'blog', 'post', 'article', 'email', 'copy', 'caption', 'content', 'newsletter'],
  outreach: ['outreach', 'prospect', 'lead', 'cold', 'follow up', 'sdr', 'pipeline', 'sell'],
  ops: ['deploy', 'server', 'infra', 'monitor', 'ci', 'pipeline', 'backup', 'migrate'],
  analytics: ['report', 'metric', 'dashboard', 'kpi', 'data', 'chart', 'track', 'measure'],
  design: ['design', 'ui', 'ux', 'mockup', 'wireframe', 'prototype', 'layout', 'figma'],
  support: ['support', 'ticket', 'issue', 'customer', 'help', 'troubleshoot'],
  strategy: ['strategy', 'plan', 'roadmap', 'prioritize', 'goal', 'okr', 'quarterly'],
  general: [],
}

export function classifyTask(title: string, description: string): TaskType {
  const text = `${title} ${description}`.toLowerCase()

  let bestType: TaskType = 'general'
  let bestCount = 0

  for (const [type, keywords] of Object.entries(KEYWORDS) as [TaskType, string[]][]) {
    if (type === 'general') continue
    const count = keywords.filter(k => text.includes(k)).length
    if (count > bestCount) {
      bestCount = count
      bestType = type
    }
  }

  return bestType
}
