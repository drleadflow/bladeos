import { Octokit } from '@octokit/rest'
import { logger } from '@blade/shared'

interface PullRequestResult {
  prUrl: string
  prNumber: number
}

export async function createPullRequest(params: {
  owner: string
  repo: string
  title: string
  body: string
  head: string
  base: string
  githubToken: string
}): Promise<PullRequestResult> {
  const octokit = new Octokit({ auth: params.githubToken })

  logger.info('GitHub', `Creating PR: ${params.title} (${params.head} -> ${params.base})`)

  const { data } = await octokit.pulls.create({
    owner: params.owner,
    repo: params.repo,
    title: params.title,
    body: params.body,
    head: params.head,
    base: params.base,
  })

  logger.info('GitHub', `PR created: ${data.html_url}`)

  return {
    prUrl: data.html_url,
    prNumber: data.number,
  }
}

export async function commentOnPR(params: {
  owner: string
  repo: string
  prNumber: number
  body: string
  githubToken: string
}): Promise<void> {
  const octokit = new Octokit({ auth: params.githubToken })

  logger.info('GitHub', `Commenting on PR #${params.prNumber}`)

  await octokit.issues.createComment({
    owner: params.owner,
    repo: params.repo,
    issue_number: params.prNumber,
    body: params.body,
  })

  logger.info('GitHub', `Comment posted on PR #${params.prNumber}`)
}

/**
 * Parse a GitHub repo URL into owner and repo name.
 * Supports: https://github.com/owner/repo, git@github.com:owner/repo.git
 */
export function parseRepoUrl(url: string): { owner: string; repo: string } {
  // HTTPS format
  const httpsMatch = url.match(/github\.com\/([^/]+)\/([^/.]+)/)
  if (httpsMatch) {
    return { owner: httpsMatch[1], repo: httpsMatch[2] }
  }

  // SSH format
  const sshMatch = url.match(/github\.com:([^/]+)\/([^/.]+)/)
  if (sshMatch) {
    return { owner: sshMatch[1], repo: sshMatch[2] }
  }

  throw new Error(`Cannot parse GitHub repo URL: ${url}`)
}
