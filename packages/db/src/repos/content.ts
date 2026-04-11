import { db, uuid, now } from './helpers.js'

// ============================================================
// CONTENT PROJECTS
// ============================================================

export const contentProjects = {
  create(params: { title: string }): { id: string } {
    const id = uuid()
    const ts = now()
    db().prepare(
      'INSERT INTO content_projects (id, title, status, video_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, params.title, 'draft', 0, ts, ts)
    return { id }
  },

  get(id: string) {
    return db().prepare(
      `SELECT id, title, status, video_count as videoCount,
       created_at as createdAt, updated_at as updatedAt
       FROM content_projects WHERE id = ?`
    ).get(id) as {
      id: string; title: string; status: string; videoCount: number
      createdAt: string; updatedAt: string
    } | undefined
  },

  list(limit = 50) {
    return db().prepare(
      `SELECT id, title, status, video_count as videoCount,
       created_at as createdAt, updated_at as updatedAt
       FROM content_projects ORDER BY created_at DESC LIMIT ?`
    ).all(limit) as {
      id: string; title: string; status: string; videoCount: number
      createdAt: string; updatedAt: string
    }[]
  },

  updateStatus(id: string, status: string): void {
    db().prepare(
      'UPDATE content_projects SET status = ?, updated_at = ? WHERE id = ?'
    ).run(status, now(), id)
  },

  incrementVideoCount(id: string): void {
    db().prepare(
      'UPDATE content_projects SET video_count = video_count + 1, updated_at = ? WHERE id = ?'
    ).run(now(), id)
  },
}

// ============================================================
// CONTENT ITEMS
// ============================================================

export const contentItems = {
  create(params: {
    projectId: string
    title?: string
    videoUrl?: string
    videoKey?: string
    fileSizeBytes?: number
  }): { id: string } {
    const id = uuid()
    const ts = now()
    db().prepare(
      `INSERT INTO content_items (id, project_id, title, status, video_url, video_key, file_size_bytes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id, params.projectId, params.title ?? null, 'uploaded',
      params.videoUrl ?? null, params.videoKey ?? null,
      params.fileSizeBytes ?? null, ts, ts
    )
    return { id }
  },

  get(id: string) {
    return db().prepare(
      `SELECT id, project_id as projectId, title, status, video_url as videoUrl,
       video_key as videoKey, thumbnail_url as thumbnailUrl,
       duration_seconds as durationSeconds, file_size_bytes as fileSizeBytes,
       transcript, transcript_segments as transcriptSegments,
       created_at as createdAt, updated_at as updatedAt
       FROM content_items WHERE id = ?`
    ).get(id) as {
      id: string; projectId: string; title: string | null; status: string
      videoUrl: string | null; videoKey: string | null; thumbnailUrl: string | null
      durationSeconds: number | null; fileSizeBytes: number | null
      transcript: string | null; transcriptSegments: string | null
      createdAt: string; updatedAt: string
    } | undefined
  },

  listByProject(projectId: string) {
    return db().prepare(
      `SELECT id, project_id as projectId, title, status, video_url as videoUrl,
       video_key as videoKey, thumbnail_url as thumbnailUrl,
       duration_seconds as durationSeconds, file_size_bytes as fileSizeBytes,
       transcript, transcript_segments as transcriptSegments,
       created_at as createdAt, updated_at as updatedAt
       FROM content_items WHERE project_id = ? ORDER BY created_at ASC`
    ).all(projectId) as {
      id: string; projectId: string; title: string | null; status: string
      videoUrl: string | null; videoKey: string | null; thumbnailUrl: string | null
      durationSeconds: number | null; fileSizeBytes: number | null
      transcript: string | null; transcriptSegments: string | null
      createdAt: string; updatedAt: string
    }[]
  },

  updateStatus(id: string, status: string): void {
    db().prepare(
      'UPDATE content_items SET status = ?, updated_at = ? WHERE id = ?'
    ).run(status, now(), id)
  },

  updateTranscript(id: string, transcript: string, segments?: unknown[]): void {
    db().prepare(
      'UPDATE content_items SET transcript = ?, transcript_segments = ?, status = ?, updated_at = ? WHERE id = ?'
    ).run(transcript, segments ? JSON.stringify(segments) : null, 'transcribed', now(), id)
  },
}

// ============================================================
// CONTENT CAPTIONS
// ============================================================

export const contentCaptions = {
  create(params: {
    itemId: string
    platform: string
    caption: string
    hashtags?: string[]
  }): { id: string } {
    const id = uuid()
    const ts = now()
    db().prepare(
      `INSERT INTO content_captions (id, item_id, platform, caption, hashtags, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, params.itemId, params.platform, params.caption, params.hashtags ? JSON.stringify(params.hashtags) : null, 'draft', ts)
    return { id }
  },

  get(id: string) {
    return db().prepare(
      `SELECT id, item_id as itemId, platform, caption, hashtags, status,
       published_at as publishedAt, published_url as publishedUrl,
       created_at as createdAt
       FROM content_captions WHERE id = ?`
    ).get(id) as {
      id: string; itemId: string; platform: string; caption: string
      hashtags: string | null; status: string
      publishedAt: string | null; publishedUrl: string | null
      createdAt: string
    } | undefined
  },

  listByItem(itemId: string) {
    return db().prepare(
      `SELECT id, item_id as itemId, platform, caption, hashtags, status,
       published_at as publishedAt, published_url as publishedUrl,
       created_at as createdAt
       FROM content_captions WHERE item_id = ? ORDER BY platform ASC`
    ).all(itemId) as {
      id: string; itemId: string; platform: string; caption: string
      hashtags: string | null; status: string
      publishedAt: string | null; publishedUrl: string | null
      createdAt: string
    }[]
  },

  updateStatus(id: string, status: string, extra?: { publishedAt?: string; publishedUrl?: string }): void {
    const sets = ['status = ?']
    const values: unknown[] = [status]

    if (extra?.publishedAt) {
      sets.push('published_at = ?')
      values.push(extra.publishedAt)
    }
    if (extra?.publishedUrl) {
      sets.push('published_url = ?')
      values.push(extra.publishedUrl)
    }

    values.push(id)
    db().prepare(`UPDATE content_captions SET ${sets.join(', ')} WHERE id = ?`).run(...values)
  },

  update(id: string, params: { caption: string; hashtags?: string[] }): void {
    db().prepare(
      'UPDATE content_captions SET caption = ?, hashtags = ? WHERE id = ?'
    ).run(params.caption, params.hashtags ? JSON.stringify(params.hashtags) : null, id)
  },

  bulkCreate(items: { itemId: string; platform: string; caption: string; hashtags?: string[] }[]): { ids: string[] } {
    const ids: string[] = []
    const stmt = db().prepare(
      `INSERT INTO content_captions (id, item_id, platform, caption, hashtags, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )

    const insertMany = db().transaction(() => {
      const ts = now()
      for (const item of items) {
        const id = uuid()
        stmt.run(id, item.itemId, item.platform, item.caption, item.hashtags ? JSON.stringify(item.hashtags) : null, 'draft', ts)
        ids.push(id)
      }
    })

    insertMany()
    return { ids }
  },
}

// ============================================================
// CONTENT SCHEDULE
// ============================================================

export const contentSchedule = {
  create(params: {
    itemId: string
    captionId?: string
    platform: string
    scheduledAt: string
  }): { id: string } {
    const id = uuid()
    const ts = now()
    db().prepare(
      `INSERT INTO content_schedule (id, item_id, caption_id, platform, scheduled_at, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, params.itemId, params.captionId ?? null, params.platform, params.scheduledAt, 'pending', ts)
    return { id }
  },

  listPending(limit = 100) {
    return db().prepare(
      `SELECT id, item_id as itemId, caption_id as captionId, platform,
       scheduled_at as scheduledAt, status, error, published_url as publishedUrl,
       created_at as createdAt
       FROM content_schedule
       WHERE status = 'pending' AND scheduled_at <= datetime('now')
       ORDER BY scheduled_at ASC LIMIT ?`
    ).all(limit) as {
      id: string; itemId: string; captionId: string | null; platform: string
      scheduledAt: string; status: string; error: string | null
      publishedUrl: string | null; createdAt: string
    }[]
  },

  updateStatus(id: string, status: string, extra?: { error?: string; publishedUrl?: string }): void {
    const sets = ['status = ?']
    const values: unknown[] = [status]

    if (extra?.error !== undefined) {
      sets.push('error = ?')
      values.push(extra.error)
    }
    if (extra?.publishedUrl) {
      sets.push('published_url = ?')
      values.push(extra.publishedUrl)
    }

    values.push(id)
    db().prepare(`UPDATE content_schedule SET ${sets.join(', ')} WHERE id = ?`).run(...values)
  },
}
