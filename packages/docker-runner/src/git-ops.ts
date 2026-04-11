import { execFileSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { logger } from '@blade/shared'

function git(args: string[], cwd?: string): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf-8',
    timeout: 120_000,
  }).trim()
}

export function cloneRepo(repoUrl: string, shallow = true): string {
  const dir = mkdtempSync(join(tmpdir(), 'blade-job-'))

  logger.info('Git', `Cloning ${repoUrl} to ${dir}`)
  const args = ['clone']
  if (shallow) args.push('--depth', '1')
  args.push(repoUrl, dir)
  git(args)

  return dir
}

export function createBranch(repoDir: string, branchName: string): void {
  logger.info('Git', `Creating branch: ${branchName}`)
  git(['checkout', '-b', branchName], repoDir)
}

/**
 * Stage all changes and commit incrementally with the given message.
 * Returns true if a commit was made, false if there was nothing to commit.
 * Uses execFileSync (safe, no shell injection).
 */
export function commitIncremental(repoDir: string, message: string): boolean {
  // Configure git user (idempotent)
  try { git(['config', 'user.email', 'blade@blade-agent.dev'], repoDir) } catch { /* already set */ }
  try { git(['config', 'user.name', 'Blade Super Agent'], repoDir) } catch { /* already set */ }

  // Stage all changes
  git(['add', '-A'], repoDir)

  // Check if there are staged changes
  try {
    git(['diff', '--cached', '--quiet'], repoDir)
    // No error means no changes
    return false
  } catch {
    // There are changes — commit them
  }

  git(['commit', '-m', message], repoDir)
  logger.debug('Git', `Incremental commit: ${message}`)
  return true
}

export function commitAndPush(
  repoDir: string,
  message: string,
  branch: string,
  githubToken?: string
): void {
  logger.info('Git', `Committing and pushing to ${branch}`)

  // Configure git user
  git(['config', 'user.email', 'blade@blade-agent.dev'], repoDir)
  git(['config', 'user.name', 'Blade Super Agent'], repoDir)

  // Stage all changes
  git(['add', '-A'], repoDir)

  // Check if there are changes to commit
  try {
    git(['diff', '--cached', '--quiet'], repoDir)
    logger.info('Git', 'No changes to commit')
    return
  } catch {
    // There are changes — proceed
  }

  git(['commit', '-m', message], repoDir)

  if (githubToken) {
    // Inject token into the remote URL directly — no temp files written to disk
    const remoteUrl = git(['remote', 'get-url', 'origin'], repoDir)
    const authedUrl = remoteUrl.replace(
      'https://github.com/',
      `https://x-access-token:${githubToken}@github.com/`
    )
    git(['remote', 'set-url', 'origin', authedUrl], repoDir)

    try {
      execFileSync('git', ['push', 'origin', branch], {
        cwd: repoDir,
        encoding: 'utf-8',
        timeout: 120_000,
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: '0',
        },
      })
    } finally {
      // Restore original URL so the token is not left in .git/config
      try { git(['remote', 'set-url', 'origin', remoteUrl], repoDir) } catch { /* ignore */ }
    }
  } else {
    git(['push', 'origin', branch], repoDir)
  }
}
