// Blade backend API client.
// All endpoints return { success: true, data: ... } with CORS enabled.

export const API_URL =
  import.meta.env.VITE_API_URL ?? "https://blade-web-production.up.railway.app";

export const VOICE_WS_URL =
  import.meta.env.VITE_VOICE_WS_URL ??
  "wss://blade-web-production.up.railway.app:7861";

const AUTH_TOKEN = import.meta.env.VITE_BLADE_TOKEN as string | undefined;

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((init?.headers as Record<string, string>) ?? {}),
  };
  if (AUTH_TOKEN) headers["Authorization"] = `Bearer ${AUTH_TOKEN}`;

  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  if (!res.ok) {
    throw new Error(`API ${path} → ${res.status} ${res.statusText}`);
  }
  const json = await res.json();
  // Backend wraps as { success, data }, but some endpoints may inline.
  return (json?.data ?? json) as T;
}

// ---------- Types ----------
export interface Employee {
  slug: string;
  name: string;
  title?: string;
  description?: string;
  department?: string;
  status?: string;
}

export interface Mission {
  id: string | number;
  title: string;
  description?: string;
  status: string; // queued | live | progress | done | failed | completed
  priority?: number;
  assignedEmployee?: string;
  domain?: string;
  progress?: number;
  createdAt?: string;
}

export interface Job {
  id: string | number;
  title: string;
  description?: string;
  status: string; // queued | cloning | branching | coding | testing | pr_creating | completed | failed
  repoUrl?: string;
  prUrl?: string;
  branch?: string;
  files?: number;
  severity?: string;
  createdAt?: string;
}

export interface Memory {
  id: string | number;
  text: string;
  domain?: string;
  source?: string;
  importance?: number;
  confidence?: number;
  date?: string;
  createdAt?: string;
  tags?: string[];
  accessCount?: number;
}

export interface MemoryStats {
  total: number;
  pinnedCount?: number;
  avgConfidence?: number;
  byType?: Record<string, number>;
}

export interface CostStats {
  totalCostUsd: number;
  byModel?: Record<string, number>;
  byEmployee?: Record<string, number>;
}

export interface ActivityEvent {
  id: string | number;
  actorType?: string;
  actorSlug?: string;
  type?: string;
  summary: string;
  createdAt?: string;
}

export interface TimelineResponse {
  events: ActivityEvent[];
  total?: number;
}

export interface HealthStatus {
  status: string;
  uptime?: number;
  dbConnected?: boolean;
}

export interface RoutingEpisode {
  id: string | number;
  taskType: string;
  selectedEmployee: string;
  selectionMethod?: string;
  reward?: number;
  createdAt?: string;
}

export interface QValue {
  taskType: string;
  employeeSlug: string;
  qValue: number;
  visitCount: number;
}

export interface RoutingStats {
  taskTypes: Array<{ taskType: string; visitCount: number }>;
}

export interface BatchRun {
  id: string;
  name: string;
  status: string; // running | paused | completed | failed | budget_exceeded
  totalJobs: number;
  completedJobs: number;
  failedJobs?: number;
  runningJobs?: number;
  totalCostUsd: number;
  maxCostUsd?: number;
  maxConcurrent?: number;
  createdAt?: string;
}

export interface SecurityEvent {
  id: string | number;
  type: string; // injection | exfiltration | other
  summary: string;
  severity: string; // low | medium | high | critical
  createdAt?: string;
}

export interface SecurityStats {
  injectionsToday: number;
  exfiltrationsToday: number;
  severity: "clear" | "elevated" | "critical" | string;
}

export interface ReasoningPattern {
  id: string | number;
  taskType: string;
  approach: string;
  confidence: number;
  useCount: number;
  successCount: number;
}

export interface ReasoningStats {
  total: number;
  byTaskType?: Record<string, number>;
}

export interface GoalProgress {
  id: string | number;
  title: string;
  description?: string;
  category?: string;
  metricName?: string;
  metricUnit?: string;
  currentValue?: number;
  targetValue?: number;
  priority?: "critical" | "high" | "medium" | "low" | string;
  deadline?: string;
  onTrack?: boolean;
  assignedAgents?: string[];
  updates?: Array<{ text: string; createdAt: string }>;
  createdAt?: string;
}

export interface GoalsDashboard {
  active: number;
  completed: number;
  onTrackPercent: number;
  goals: GoalProgress[];
}

export interface EscalationRule {
  id: string | number;
  name: string;
  description?: string;
  conditionType: string;
  conditionThreshold: number;
  action: "notify" | "pause" | "escalate" | string;
  enabled: boolean;
  triggerCount?: number;
  lastTriggeredAt?: string;
  cooldownMinutes?: number;
}

export interface EscalationEvent {
  id: string | number;
  ruleName: string;
  conditionValue?: number;
  action?: string;
  resolved?: boolean;
  createdAt?: string;
}

export interface ReportingMetrics {
  missionsCompleted: number;
  missionsSuccessRate: number;
  prsOpened: number;
  prsMerged: number;
  totalCostUsd: number;
  costPerMission: number;
  memoriesCreated: number;
  securityStatus: string;
}

export interface ReportingEmployee {
  slug: string;
  name: string;
  missionsCompleted: number;
  successRate: number;
  totalCostUsd: number;
  costPerMission: number;
}

export interface Plugin {
  name: string;
  version?: string;
  type?: "hook" | "tool" | "provider" | "worker" | string;
  description?: string;
  enabled: boolean;
  crashCount?: number;
}

// ---------- Endpoints ----------
export const api = {
  health: () => apiFetch<HealthStatus>("/api/health"),
  employees: () => apiFetch<Employee[]>("/api/employees"),
  missions: () => apiFetch<Mission[]>("/api/missions"),
  createMission: (body: { title: string; description?: string; priority?: number }) =>
    apiFetch<Mission>("/api/missions", { method: "POST", body: JSON.stringify(body) }),
  updateMission: (id: string | number, body: { status: string }) =>
    apiFetch<Mission>(`/api/missions/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  approveMission: (id: string) =>
    apiFetch<Mission>(`/api/missions/${id}/approve`, { method: "POST" }),
  rejectMission: (id: string, reason: string) =>
    apiFetch<Mission>(`/api/missions/${id}/reject`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),
  respondToMission: (id: string, response: string) =>
    apiFetch<Mission>(`/api/missions/${id}/respond`, {
      method: "POST",
      body: JSON.stringify({ response }),
    }),
  jobs: () => apiFetch<Job[]>("/api/jobs"),
  createJob: (body: { title: string; description?: string; repoUrl?: string }) =>
    apiFetch<Job>("/api/jobs", { method: "POST", body: JSON.stringify(body) }),
  memorySearch: (q = "") =>
    apiFetch<Memory[]>(`/api/memory${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  memoryStats: () => apiFetch<MemoryStats>("/api/memory/stats"),
  costs: (period = "today") => apiFetch<CostStats>(`/api/costs?period=${period}`),
  timeline: (limit = 20, actor?: string) =>
    apiFetch<TimelineResponse>(
      `/api/timeline?limit=${limit}${actor ? `&actor=${actor}` : ""}`,
    ),
  briefing: () => apiFetch<{ briefing: string }>("/api/briefing"),

  // intelligence
  routingStats: () => apiFetch<RoutingStats>("/api/routing/stats"),
  routingEpisodes: async (limit = 20) => {
    const res = await apiFetch<{ episodes: RoutingEpisode[] } | RoutingEpisode[]>(`/api/routing/episodes?limit=${limit}`);
    return Array.isArray(res) ? res : (res?.episodes ?? []);
  },
  routingQValues: async (taskType?: string) => {
    const res = await apiFetch<{ qValues: QValue[] } | QValue[]>(`/api/routing/q-values${taskType ? `?taskType=${taskType}` : ""}`);
    return Array.isArray(res) ? res : (res?.qValues ?? []);
  },

  autopilotBatches: async () => {
    const res = await apiFetch<{ batches: BatchRun[] } | BatchRun[]>("/api/autopilot/batches");
    return Array.isArray(res) ? res : (res?.batches ?? []);
  },
  createBatch: (body: {
    name: string;
    maxConcurrent?: number;
    maxCostUsd?: number;
    jobs: Array<{ title: string; description?: string }>;
  }) =>
    apiFetch<BatchRun>("/api/autopilot/batches", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  batchAction: (id: string, action: "stop" | "cancel") =>
    apiFetch<BatchRun>(`/api/autopilot/batches/${id}`, {
      method: "POST",
      body: JSON.stringify({ action }),
    }),

  securityStats: () => apiFetch<SecurityStats>("/api/security/stats"),
  securityEvents: async (limit = 50) => {
    const res = await apiFetch<{ events: SecurityEvent[] } | SecurityEvent[]>(`/api/security/events?limit=${limit}`);
    return Array.isArray(res) ? res : (res?.events ?? []);
  },

  reasoningStats: () => apiFetch<ReasoningStats>("/api/reasoning/stats"),
  reasoningPatterns: async (taskType?: string, limit = 20) => {
    const res = await apiFetch<{ patterns: ReasoningPattern[] } | ReasoningPattern[]>(
      `/api/reasoning/patterns?limit=${limit}${taskType ? `&taskType=${taskType}` : ""}`,
    );
    return Array.isArray(res) ? res : (res?.patterns ?? []);
  },

  // goals
  goals: () => apiFetch<GoalProgress[]>("/api/goals"),
  goalsDashboard: () => apiFetch<GoalsDashboard>("/api/goals/dashboard"),
  createGoal: (body: {
    title: string;
    description?: string;
    category?: string;
    metricName?: string;
    metricUnit?: string;
    targetValue?: number;
    priority?: string;
    deadline?: string;
    assignedAgents?: string[];
  }) => apiFetch<GoalProgress>("/api/goals", { method: "POST", body: JSON.stringify(body) }),
  updateGoal: (id: string | number, body: Partial<GoalProgress>) =>
    apiFetch<GoalProgress>(`/api/goals/${id}`, { method: "PATCH", body: JSON.stringify(body) }),

  // escalation
  escalationRules: () => apiFetch<EscalationRule[]>("/api/escalation/rules"),
  escalationEvents: () => apiFetch<EscalationEvent[]>("/api/escalation/events"),
  createEscalationRule: (body: {
    name: string;
    description?: string;
    conditionType: string;
    conditionThreshold: number;
    action: string;
    cooldownMinutes?: number;
  }) => apiFetch<EscalationRule>("/api/escalation/rules", { method: "POST", body: JSON.stringify(body) }),
  evaluateEscalation: () => apiFetch<{ triggered: number }>("/api/escalation/evaluate", { method: "POST" }),
  resolveEscalationEvent: (id: string | number) =>
    apiFetch<EscalationEvent>(`/api/escalation/events/${id}/resolve`, { method: "POST" }),

  // reporting
  reportingMetrics: (period = 7) =>
    apiFetch<ReportingMetrics>(`/api/reporting/metrics?period=${period}`),
  reportingEmployees: (period = 7) =>
    apiFetch<ReportingEmployee[]>(`/api/reporting/employees?period=${period}`),

  // plugins
  plugins: async () => {
    const res = await apiFetch<{ plugins: Plugin[] } | Plugin[]>("/api/plugins");
    return Array.isArray(res) ? res : (res?.plugins ?? []);
  },
  togglePlugin: (name: string, action: "enable" | "disable" | "reset") =>
    apiFetch<Plugin>("/api/plugins", { method: "POST", body: JSON.stringify({ name, action }) }),
};

export const DEPARTMENT_COLORS: Record<string, { color: string; glow: string }> = {
  leadership: { color: "#DC2626", glow: "rgba(220,38,38,0.6)" },
  sales: { color: "#7C3AED", glow: "rgba(124,58,237,0.6)" },
  marketing: { color: "#2563EB", glow: "rgba(37,99,235,0.6)" },
  content: { color: "#D97706", glow: "rgba(217,119,6,0.6)" },
  ops: { color: "#6B7280", glow: "rgba(107,114,128,0.6)" },
  engineering: { color: "#10B981", glow: "rgba(16,185,129,0.6)" },
  general: { color: "#8B5CF6", glow: "rgba(139,92,246,0.6)" },
};

export function deptColor(dept?: string) {
  return DEPARTMENT_COLORS[dept ?? "general"] ?? DEPARTMENT_COLORS.general;
}
