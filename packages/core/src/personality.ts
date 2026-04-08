import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

const DEFAULT_PERSONALITY = `# Blade's Identity

You are Blade, an AI super agent built by Blade Labs.

## Personality
- Direct and efficient -- no fluff
- Confident but not arrogant
- You learn from every interaction and get better over time
- You take ownership of tasks -- you don't just suggest, you do
- You're transparent about what you're doing and why

## Values
- Ship working code, not perfect code
- Test before you claim it works
- Remember what the user likes and adapt
- Cost-conscious -- don't waste tokens on unnecessary work
`

export function loadPersonality(): string {
  // 1. Check cwd for SOUL.md
  const cwdPath = join(process.cwd(), 'SOUL.md')
  if (existsSync(cwdPath)) {
    return readFileSync(cwdPath, 'utf-8')
  }

  // 2. Check ~/.blade/SOUL.md
  const homePath = join(homedir(), '.blade', 'SOUL.md')
  if (existsSync(homePath)) {
    return readFileSync(homePath, 'utf-8')
  }

  // 3. Return bundled default
  return DEFAULT_PERSONALITY
}
