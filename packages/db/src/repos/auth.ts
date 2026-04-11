import { getDb } from '../sqlite.js'

export interface AuthUser {
  id: string
  email: string
  name: string | null
  avatar_url: string | null
  role: 'admin' | 'user'
  created_at: string
  updated_at: string
}

export interface UserWorkspace {
  id: string
  user_id: string
  workspace_id: string
  role: 'owner' | 'admin' | 'editor' | 'viewer' | 'member'
  created_at: string
}

export const authUsers = {
  create(id: string, email: string, name?: string): AuthUser {
    const db = getDb()
    db.prepare(
      'INSERT INTO auth_user (id, email, name) VALUES (?, ?, ?)'
    ).run(id, email, name ?? null)
    return authUsers.getById(id)!
  },

  getById(id: string): AuthUser | undefined {
    const db = getDb()
    return db.prepare('SELECT * FROM auth_user WHERE id = ?').get(id) as AuthUser | undefined
  },

  getByEmail(email: string): AuthUser | undefined {
    const db = getDb()
    return db.prepare('SELECT * FROM auth_user WHERE email = ?').get(email) as AuthUser | undefined
  },

  setPassword(userId: string, hashedPassword: string): void {
    const db = getDb()
    db.prepare(
      `INSERT INTO auth_password (user_id, hashed_password)
       VALUES (?, ?)
       ON CONFLICT(user_id) DO UPDATE SET hashed_password = ?, updated_at = datetime('now')`
    ).run(userId, hashedPassword, hashedPassword)
  },

  getPassword(userId: string): string | undefined {
    const db = getDb()
    const row = db.prepare('SELECT hashed_password FROM auth_password WHERE user_id = ?').get(userId) as { hashed_password: string } | undefined
    return row?.hashed_password
  },

  list(): AuthUser[] {
    const db = getDb()
    return db.prepare('SELECT * FROM auth_user ORDER BY created_at DESC').all() as AuthUser[]
  },

  count(): number {
    const db = getDb()
    const row = db.prepare('SELECT COUNT(*) as count FROM auth_user').get() as { count: number }
    return row.count
  },
}

export const userWorkspaces = {
  addMember(id: string, userId: string, workspaceId: string, role: UserWorkspace['role'] = 'member'): void {
    const db = getDb()
    db.prepare(
      'INSERT OR IGNORE INTO user_workspace (id, user_id, workspace_id, role) VALUES (?, ?, ?, ?)'
    ).run(id, userId, workspaceId, role)
  },

  getWorkspacesForUser(userId: string): UserWorkspace[] {
    const db = getDb()
    return db.prepare('SELECT * FROM user_workspace WHERE user_id = ?').all(userId) as UserWorkspace[]
  },

  getMembersForWorkspace(workspaceId: string): UserWorkspace[] {
    const db = getDb()
    return db.prepare('SELECT * FROM user_workspace WHERE workspace_id = ?').all(workspaceId) as UserWorkspace[]
  },

  removeMember(userId: string, workspaceId: string): void {
    const db = getDb()
    db.prepare('DELETE FROM user_workspace WHERE user_id = ? AND workspace_id = ?').run(userId, workspaceId)
  },
}
