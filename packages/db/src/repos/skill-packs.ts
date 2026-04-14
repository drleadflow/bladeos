import { db, uuid, now } from './helpers.js'

// ============================================================
// SKILL PACKS
// ============================================================

export const skillPacks = {
  installPack(pack: {
    name: string
    displayName: string
    version: number
    vertical: string
    description: string
  }): { id: string } {
    const id = uuid()
    const ts = now()
    db().prepare(
      `INSERT INTO skill_packs (id, name, display_name, version, vertical, description, active, installed_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?)
       ON CONFLICT(name) DO UPDATE SET
         display_name = excluded.display_name,
         version = excluded.version,
         vertical = excluded.vertical,
         description = excluded.description,
         active = 1,
         installed_at = excluded.installed_at`
    ).run(id, pack.name, pack.displayName, pack.version, pack.vertical, pack.description, ts)
    return { id }
  },

  getInstalledPack(name: string) {
    return db().prepare(
      `SELECT id, name, display_name as displayName, version, vertical, description, active,
       installed_at as installedAt
       FROM skill_packs WHERE name = ?`
    ).get(name) as {
      id: string
      name: string
      displayName: string
      version: number
      vertical: string
      description: string
      active: number
      installedAt: string
    } | undefined
  },

  listInstalledPacks() {
    return db().prepare(
      `SELECT id, name, display_name as displayName, version, vertical, description, active,
       installed_at as installedAt
       FROM skill_packs WHERE active = 1 ORDER BY installed_at DESC`
    ).all() as {
      id: string
      name: string
      displayName: string
      version: number
      vertical: string
      description: string
      active: number
      installedAt: string
    }[]
  },

  assignSkillToEmployee(employeeId: string, skillName: string, source: string, packName?: string): void {
    const id = uuid()
    const ts = now()
    db().prepare(
      `INSERT INTO employee_skills (id, employee_id, skill_name, source, pack_name, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(employee_id, skill_name) DO UPDATE SET
         source = excluded.source,
         pack_name = excluded.pack_name`
    ).run(id, employeeId, skillName, source, packName ?? null, ts)
  },

  getEmployeeSkills(employeeId: string) {
    return db().prepare(
      `SELECT id, employee_id as employeeId, skill_name as skillName, source, pack_name as packName,
       created_at as createdAt
       FROM employee_skills WHERE employee_id = ? ORDER BY created_at`
    ).all(employeeId) as {
      id: string
      employeeId: string
      skillName: string
      source: string
      packName: string | null
      createdAt: string
    }[]
  },

  removePackSkills(packName: string): number {
    const result = db().prepare(
      'DELETE FROM employee_skills WHERE pack_name = ?'
    ).run(packName)
    return result.changes
  },
}
