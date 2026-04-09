'use client'

import { useState } from 'react'
import { PageShell, Panel, PanelHeader } from '@/components/dashboard/cockpit-ui'

type Role = 'Owner' | 'Admin' | 'Employee' | 'Viewer'
type Permission = 'canApprove' | 'canExecute' | 'canConfigure' | 'canViewCosts' | 'canManageEmployees'

interface RolePermissions {
  role: Role
  description: string
  permissions: Record<Permission, boolean>
}

const PERMISSION_LABELS: Record<Permission, { label: string; description: string }> = {
  canApprove: { label: 'Approve Actions', description: 'Approve or reject pending agent actions' },
  canExecute: { label: 'Execute Tasks', description: 'Trigger agents and run automations' },
  canConfigure: { label: 'Configure System', description: 'Edit settings, keys, and agent configs' },
  canViewCosts: { label: 'View Costs', description: 'See spend data and billing details' },
  canManageEmployees: { label: 'Manage Employees', description: 'Add, edit, or remove AI employees' },
}

const PERMISSIONS = Object.keys(PERMISSION_LABELS) as Permission[]

const INITIAL_ROLES: RolePermissions[] = [
  {
    role: 'Owner',
    description: 'Full access to everything. Cannot be restricted.',
    permissions: {
      canApprove: true,
      canExecute: true,
      canConfigure: true,
      canViewCosts: true,
      canManageEmployees: true,
    },
  },
  {
    role: 'Admin',
    description: 'Operational control without billing visibility.',
    permissions: {
      canApprove: true,
      canExecute: true,
      canConfigure: true,
      canViewCosts: false,
      canManageEmployees: true,
    },
  },
  {
    role: 'Employee',
    description: 'Can execute tasks and approve low-risk actions.',
    permissions: {
      canApprove: false,
      canExecute: true,
      canConfigure: false,
      canViewCosts: false,
      canManageEmployees: false,
    },
  },
  {
    role: 'Viewer',
    description: 'Read-only access. Cannot trigger or configure anything.',
    permissions: {
      canApprove: false,
      canExecute: false,
      canConfigure: false,
      canViewCosts: false,
      canManageEmployees: false,
    },
  },
]

const ROLE_COLORS: Record<Role, string> = {
  Owner: '#f472b6',
  Admin: '#94a3b8',
  Employee: '#34d399',
  Viewer: '#60a5fa',
}

export default function PermissionsPage() {
  const [roles, setRoles] = useState<RolePermissions[]>(INITIAL_ROLES)
  const [saved, setSaved] = useState(false)

  function togglePermission(role: Role, permission: Permission) {
    if (role === 'Owner') return // Owner permissions are immutable
    setRoles((prev) =>
      prev.map((r) =>
        r.role === role
          ? { ...r, permissions: { ...r.permissions, [permission]: !r.permissions[permission] } }
          : r
      )
    )
    setSaved(false)
  }

  function handleSave() {
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <PageShell
      eyebrow="Control / Permissions"
      title="Role-based access control"
      description="Define exactly what each role can see, do, and act on autonomously within Blade OS."
      actions={
        <button
          onClick={handleSave}
          className="rounded-2xl px-4 py-2.5 text-sm font-semibold text-zinc-950 transition-transform duration-200 hover:scale-[1.01]"
          style={{ background: saved ? 'linear-gradient(to right, #34d399, #10b981)' : 'linear-gradient(to right, #94a3b8, #64748b)' }}
        >
          {saved ? 'Saved ✓' : 'Save Changes'}
        </button>
      }
    >
      {/* Desktop table */}
      <Panel className="hidden md:block overflow-x-auto">
        <PanelHeader
          eyebrow="Permission Matrix"
          title="Role capabilities"
          description="Check or uncheck permissions per role. Owner permissions are locked."
        />
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="pb-4 text-left text-xs font-medium uppercase tracking-[0.2em] text-zinc-500 w-48">
                Permission
              </th>
              {roles.map((r) => (
                <th key={r.role} className="pb-4 text-center text-xs font-medium uppercase tracking-[0.2em]" style={{ color: ROLE_COLORS[r.role] }}>
                  {r.role}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.06]">
            {PERMISSIONS.map((perm) => (
              <tr key={perm} className="group">
                <td className="py-4 pr-6">
                  <p className="text-sm font-medium text-zinc-200">{PERMISSION_LABELS[perm].label}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">{PERMISSION_LABELS[perm].description}</p>
                </td>
                {roles.map((r) => (
                  <td key={r.role} className="py-4 text-center">
                    <button
                      onClick={() => togglePermission(r.role, perm)}
                      disabled={r.role === 'Owner'}
                      aria-label={`${r.permissions[perm] ? 'Revoke' : 'Grant'} ${perm} for ${r.role}`}
                      className={`inline-flex h-6 w-6 items-center justify-center rounded-lg border transition-colors ${
                        r.permissions[perm]
                          ? 'border-transparent text-zinc-950'
                          : 'border-white/10 bg-white/[0.04] text-transparent hover:border-white/20'
                      } ${r.role === 'Owner' ? 'cursor-not-allowed opacity-80' : 'cursor-pointer hover:scale-110'}`}
                      style={
                        r.permissions[perm]
                          ? { backgroundColor: ROLE_COLORS[r.role] }
                          : {}
                      }
                    >
                      ✓
                    </button>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      {/* Mobile cards */}
      <div className="md:hidden space-y-4">
        {roles.map((r) => (
          <Panel key={r.role}>
            <div className="flex items-center gap-3 mb-4">
              <span
                className="inline-block h-3 w-3 rounded-full"
                style={{ backgroundColor: ROLE_COLORS[r.role] }}
              />
              <div>
                <p className="text-sm font-semibold text-zinc-100">{r.role}</p>
                <p className="text-xs text-zinc-500">{r.description}</p>
              </div>
            </div>
            <div className="space-y-3">
              {PERMISSIONS.map((perm) => (
                <div key={perm} className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-zinc-300">{PERMISSION_LABELS[perm].label}</p>
                  </div>
                  <button
                    onClick={() => togglePermission(r.role, perm)}
                    disabled={r.role === 'Owner'}
                    className={`relative h-5 w-9 rounded-full transition-colors ${
                      r.permissions[perm] ? '' : 'bg-white/10'
                    } ${r.role === 'Owner' ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                    style={r.permissions[perm] ? { backgroundColor: ROLE_COLORS[r.role] } : {}}
                  >
                    <span
                      className={`absolute top-0.5 h-4 w-4 rounded-full bg-zinc-950 transition-transform ${
                        r.permissions[perm] ? 'translate-x-4' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>
              ))}
            </div>
          </Panel>
        ))}
      </div>

      {/* Role descriptions */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {roles.map((r) => (
          <div
            key={r.role}
            className="rounded-[1.3rem] border border-white/10 bg-zinc-950/45 px-4 py-3"
          >
            <div className="flex items-center gap-2 mb-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: ROLE_COLORS[r.role] }} />
              <p className="text-sm font-semibold text-zinc-100">{r.role}</p>
            </div>
            <p className="text-xs text-zinc-500">{r.description}</p>
            <p className="mt-2 text-xs font-medium" style={{ color: ROLE_COLORS[r.role] }}>
              {Object.values(r.permissions).filter(Boolean).length} / {PERMISSIONS.length} permissions
            </p>
          </div>
        ))}
      </div>
    </PageShell>
  )
}
