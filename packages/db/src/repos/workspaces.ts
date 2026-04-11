import { db, uuid, now } from './helpers.js'

// ============================================================
// WORKSPACES (Persistent project environments)
// ============================================================

export const workspaces = {
  create(params: {
    name: string
    repoUrl: string
    branch?: string
    localPath: string
    ownerChatId?: string
  }): { id: string } {
    const id = uuid()
    db().prepare(
      `INSERT INTO workspaces (id, name, repo_url, branch, local_path, status, owner_chat_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'cloning', ?, ?, ?)`
    ).run(id, params.name, params.repoUrl, params.branch ?? 'main', params.localPath, params.ownerChatId ?? null, now(), now())
    return { id }
  },

  get(id: string) {
    return db().prepare(
      `SELECT id, name, repo_url as repoUrl, branch, local_path as localPath, status,
       owner_chat_id as ownerChatId, last_command as lastCommand, last_command_at as lastCommandAt,
       total_commands as totalCommands, total_commits as totalCommits, total_prs as totalPrs,
       error, created_at as createdAt, updated_at as updatedAt
       FROM workspaces WHERE id = ?`
    ).get(id) as {
      id: string; name: string; repoUrl: string; branch: string; localPath: string; status: string
      ownerChatId: string | null; lastCommand: string | null; lastCommandAt: string | null
      totalCommands: number; totalCommits: number; totalPrs: number
      error: string | null; createdAt: string; updatedAt: string
    } | undefined
  },

  findByRepo(repoUrl: string, ownerChatId?: string) {
    if (ownerChatId) {
      return db().prepare(
        `SELECT id, name, repo_url as repoUrl, branch, local_path as localPath, status, updated_at as updatedAt
         FROM workspaces WHERE repo_url = ? AND owner_chat_id = ? AND status != 'archived' ORDER BY updated_at DESC LIMIT 1`
      ).get(repoUrl, ownerChatId) as { id: string; name: string; repoUrl: string; branch: string; localPath: string; status: string; updatedAt: string } | undefined
    }
    return db().prepare(
      `SELECT id, name, repo_url as repoUrl, branch, local_path as localPath, status, updated_at as updatedAt
       FROM workspaces WHERE repo_url = ? AND status != 'archived' ORDER BY updated_at DESC LIMIT 1`
    ).get(repoUrl) as { id: string; name: string; repoUrl: string; branch: string; localPath: string; status: string; updatedAt: string } | undefined
  },

  list(ownerChatId?: string) {
    if (ownerChatId) {
      return db().prepare(
        `SELECT id, name, repo_url as repoUrl, branch, status, total_commands as totalCommands,
         last_command_at as lastCommandAt, created_at as createdAt
         FROM workspaces WHERE owner_chat_id = ? AND status != 'archived' ORDER BY updated_at DESC`
      ).all(ownerChatId) as { id: string; name: string; repoUrl: string; branch: string; status: string; totalCommands: number; lastCommandAt: string | null; createdAt: string }[]
    }
    return db().prepare(
      `SELECT id, name, repo_url as repoUrl, branch, status, total_commands as totalCommands,
       owner_chat_id as ownerChatId, last_command_at as lastCommandAt, created_at as createdAt
       FROM workspaces WHERE status != 'archived' ORDER BY updated_at DESC`
    ).all() as { id: string; name: string; repoUrl: string; branch: string; status: string; totalCommands: number; ownerChatId: string | null; lastCommandAt: string | null; createdAt: string }[]
  },

  updateStatus(id: string, status: string, error?: string): void {
    db().prepare('UPDATE workspaces SET status = ?, error = ?, updated_at = ? WHERE id = ?').run(status, error ?? null, now(), id)
  },

  recordCommand(id: string, command: string): void {
    db().prepare(
      'UPDATE workspaces SET last_command = ?, last_command_at = ?, total_commands = total_commands + 1, updated_at = ? WHERE id = ?'
    ).run(command, now(), now(), id)
  },

  recordCommit(id: string): void {
    db().prepare('UPDATE workspaces SET total_commits = total_commits + 1, updated_at = ? WHERE id = ?').run(now(), id)
  },

  recordPr(id: string): void {
    db().prepare('UPDATE workspaces SET total_prs = total_prs + 1, updated_at = ? WHERE id = ?').run(now(), id)
  },

  archive(id: string): void {
    db().prepare("UPDATE workspaces SET status = 'archived', updated_at = ? WHERE id = ?").run(now(), id)
  },

  // Active workspace per chat
  setActive(chatId: string, workspaceId: string): void {
    db().prepare(
      `INSERT INTO active_workspaces (chat_id, workspace_id, activated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(chat_id) DO UPDATE SET workspace_id = excluded.workspace_id, activated_at = excluded.activated_at`
    ).run(chatId, workspaceId, now())
  },

  getActive(chatId: string): string | undefined {
    const row = db().prepare('SELECT workspace_id FROM active_workspaces WHERE chat_id = ?').get(chatId) as { workspace_id: string } | undefined
    return row?.workspace_id
  },

  clearActive(chatId: string): void {
    db().prepare('DELETE FROM active_workspaces WHERE chat_id = ?').run(chatId)
  },
}
