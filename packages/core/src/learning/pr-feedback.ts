import { memories, jobEvals, activityEvents } from '@blade/db'
import { logger } from '@blade/shared'

/**
 * PR Feedback Pipeline — Learn from merged PR reviews.
 *
 * After a PR is merged, fetches review comments via GitHub API,
 * extracts patterns and lessons, saves them to memory,
 * and updates the job eval with PR outcome data.
 *
 * This is the Karpathy compound improvement loop:
 * code → PR → review → learn → better code next time.
 */

interface PRReviewComment {
  body: string
  path: string
  user: { login: string }
  created_at: string
}

interface PRData {
  number: number
  state: string
  merged: boolean
  merged_at: string | null
  comments: number
  review_comments: number
  created_at: string
}

/**
 * Fetch PR data and review comments from GitHub.
 */
async function fetchPRData(
  owner: string,
  repo: string,
  prNumber: number,
  githubToken: string,
): Promise<{ pr: PRData; comments: PRReviewComment[] } | null> {
  const headers = {
    Authorization: `token ${githubToken}`,
    Accept: 'application/vnd.github.v3+json',
  }

  try {
    // Fetch PR metadata
    const prRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`, { headers })
    if (!prRes.ok) {
      logger.warn('PRFeedback', `Failed to fetch PR #${prNumber}: ${prRes.status}`)
      return null
    }
    const pr = (await prRes.json()) as PRData

    // Fetch review comments
    const commentsRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/comments`, { headers })
    const comments: PRReviewComment[] = commentsRes.ok ? (await commentsRes.json()) as PRReviewComment[] : []

    return { pr, comments }
  } catch (err) {
    logger.error('PRFeedback', `GitHub API error: ${err instanceof Error ? err.message : String(err)}`)
    return null
  }
}

/**
 * Extract learnings from PR review comments.
 * Filters out trivial comments and extracts actionable feedback.
 */
function extractLearnings(comments: PRReviewComment[]): string[] {
  const learnings: string[] = []
  const trivialPatterns = /^(lgtm|looks good|nice|thanks|nit|typo|\+1|approved)/i

  for (const comment of comments) {
    const body = comment.body.trim()
    if (!body || body.length < 20) continue
    if (trivialPatterns.test(body)) continue

    // Extract the core feedback
    const learning = `[PR Review] ${comment.user.login} on ${comment.path}: ${body.slice(0, 500)}`
    learnings.push(learning)
  }

  return learnings
}

/**
 * Process a merged PR: fetch reviews, extract learnings, update eval.
 * Call this after a coding pipeline job produces a PR that gets merged.
 */
export async function processPRFeedback(params: {
  jobId: string
  owner: string
  repo: string
  prNumber: number
  githubToken: string
}): Promise<{ learningsSaved: number; prMerged: boolean }> {
  const { jobId, owner, repo, prNumber, githubToken } = params

  const data = await fetchPRData(owner, repo, prNumber, githubToken)
  if (!data) {
    return { learningsSaved: 0, prMerged: false }
  }

  const { pr, comments } = data
  const prMerged = pr.merged === true

  // Update job eval with PR outcome
  try {
    const timeToMergeMs = pr.merged_at && pr.created_at
      ? new Date(pr.merged_at).getTime() - new Date(pr.created_at).getTime()
      : undefined

    jobEvals.updatePrOutcome(jobId, {
      prMerged,
      prReviewComments: comments.length,
      prTimeToMergeMs: timeToMergeMs,
    })
  } catch (err) {
    logger.debug('PRFeedback', `Failed to update eval: ${err instanceof Error ? err.message : String(err)}`)
  }

  // Extract and save learnings from review comments
  const learnings = extractLearnings(comments)
  let learningsSaved = 0

  for (const learning of learnings) {
    try {
      memories.create({
        type: 'error_pattern', // Using existing type — review feedback helps avoid future errors
        content: learning,
        tags: ['pr-review', `repo:${owner}/${repo}`, `pr:${prNumber}`],
        source: `github:${owner}/${repo}#${prNumber}`,
        confidence: 0.8,
      })
      learningsSaved++
    } catch (err) {
      logger.debug('PRFeedback', `Failed to save learning: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // Emit activity event
  if (learningsSaved > 0 || prMerged) {
    activityEvents.emit({
      eventType: 'pr_feedback',
      actorType: 'system',
      actorId: 'pr-feedback-pipeline',
      summary: prMerged
        ? `PR #${prNumber} merged — ${learningsSaved} learning${learningsSaved !== 1 ? 's' : ''} extracted from ${comments.length} review comment${comments.length !== 1 ? 's' : ''}`
        : `PR #${prNumber} has ${comments.length} review comment${comments.length !== 1 ? 's' : ''} — ${learningsSaved} learning${learningsSaved !== 1 ? 's' : ''} saved`,
      targetType: 'job',
      targetId: jobId,
      detail: {
        prNumber,
        repo: `${owner}/${repo}`,
        merged: prMerged,
        reviewComments: comments.length,
        learningsSaved,
      },
      jobId,
    })
  }

  logger.info('PRFeedback', `PR #${prNumber} processed: merged=${prMerged}, ${learningsSaved} learnings from ${comments.length} comments`)

  return { learningsSaved, prMerged }
}

/**
 * Check all completed jobs that have PRs and process any that haven't been checked yet.
 * Designed to be called on a schedule (e.g., every hour).
 */
export async function checkPendingPRFeedback(githubToken: string): Promise<number> {
  let processed = 0

  try {
    const { getDb } = await import('@blade/db')
    const db = getDb()

    // Find jobs with PRs that don't have eval PR outcome data yet
    const pending = db.prepare(
      `SELECT j.id as jobId, j.repo_url as repoUrl, j.pr_number as prNumber
       FROM jobs j
       LEFT JOIN job_evals je ON j.id = je.job_id
       WHERE j.status = 'completed'
         AND j.pr_number IS NOT NULL
         AND j.pr_number > 0
         AND (je.pr_merged IS NULL OR je.pr_merged = 0)
       ORDER BY j.completed_at DESC
       LIMIT 10`
    ).all() as { jobId: string; repoUrl: string; prNumber: number }[]

    for (const row of pending) {
      // Parse owner/repo from URL
      const match = row.repoUrl.match(/github\.com\/([^/]+)\/([^/.]+)/)
      if (!match) continue

      const [, owner, repo] = match
      await processPRFeedback({
        jobId: row.jobId,
        owner,
        repo,
        prNumber: row.prNumber,
        githubToken,
      })
      processed++
    }
  } catch (err) {
    logger.error('PRFeedback', `Batch check failed: ${err instanceof Error ? err.message : String(err)}`)
  }

  return processed
}
