import { execSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { logger } from '@blade/shared'

function run(cmd: string, cwd?: string): string {
  return execSync(cmd, { cwd, encoding: 'utf-8', timeout: 120_000 }).trim()
}

export function cloneRepo(repoUrl: string, shallow = true): string {
  const dir = mkdtempSync(join(tmpdir(), 'blade-job-'))

  logger.info('Git', `Cloning ${repoUrl} to ${dir}`)
  const depthFlag = shallow ? '--depth 1' : ''
  run(`git clone ${depthFlag} ${repoUrl} ${dir}`)

  return dir
}

export function createBranch(repoDir: string, branchName: string): void {
  logger.info('Git', `Creating branch: ${branchName}`)
  run(`git checkout -b ${branchName}`, repoDir)
}

export function commitAndPush(
  repoDir: string,
  message: string,
  branch: string,
  githubToken?: string
): void {
  logger.info('Git', `Committing and pushing to ${branch}`)

  // Configure git user for the commit
  run('git config user.email "blade@blade-agent.dev"', repoDir)
  run('git config user.name "Blade Super Agent"', repoDir)

  // Stage all changes
  run('git add -A', repoDir)

  // Check if there are changes to commit
  try {
    run('git diff --cached --quiet', repoDir)
    logger.info('Git', 'No changes to commit')
    return
  } catch {
    // There are changes — proceed
  }

  run(`git commit -m "${message.replace(/"/g, '\\"')}"`, repoDir)

  // Set up auth if token provided
  if (githubToken) {
    const remoteUrl = run('git remote get-url origin', repoDir)
    const authedUrl = remoteUrl.replace('https://', `https://x-access-token:${githubToken}@`)
    run(`git remote set-url origin ${authedUrl}`, repoDir)
  }

  run(`git push origin ${branch}`, repoDir)
}
