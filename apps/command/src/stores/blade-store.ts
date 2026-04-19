import { create } from "zustand";
import {
  api,
  type Employee,
  type Mission,
  type Memory,
  type Job,
  type BatchRun,
  type SecurityStats,
  type SecurityEvent,
  type RoutingStats,
  type RoutingEpisode,
  type QValue,
  type ReasoningPattern,
  type ReasoningStats,
  type ActivityEvent,
  type HealthStatus,
  type GoalProgress,
  type EscalationRule,
  type EscalationEvent,
  type ReportingMetrics,
  type ReportingEmployee,
  type Plugin,
} from "@/lib/api";

export type VoiceState = "idle" | "listening" | "thinking" | "speaking";

interface BladeState {
  // data
  health: HealthStatus | null;
  employees: Employee[];
  missions: Mission[];
  memories: Memory[];
  memoryStats: { total: number; avgConfidence?: number } | null;
  jobs: Job[];
  batchRuns: BatchRun[];
  securityStats: SecurityStats | null;
  securityEvents: SecurityEvent[];
  routingStats: RoutingStats | null;
  routingEpisodes: RoutingEpisode[];
  qValues: QValue[];
  reasoningPatterns: ReasoningPattern[];
  reasoningStats: ReasoningStats | null;
  timeline: ActivityEvent[];
  todayCost: number;

  // new pages
  goals: GoalProgress[];
  escalationRules: EscalationRule[];
  escalationEvents: EscalationEvent[];
  reportingMetrics: ReportingMetrics | null;
  reportingEmployees: ReportingEmployee[];
  reportingPeriod: number;
  plugins: Plugin[];

  // voice
  voiceState: VoiceState;
  isMuted: boolean;
  activeEmployee: string | null;
  transcript: Array<{ id: number; role: "you" | "agent"; text: string; via?: string }>;

  // loading flags
  loading: Record<string, boolean>;
  errors: Record<string, string | null>;

  // actions
  refreshAll: () => Promise<void>;
  fetchHealth: () => Promise<void>;
  fetchEmployees: () => Promise<void>;
  fetchMissions: () => Promise<void>;
  fetchJobs: () => Promise<void>;
  fetchTimeline: () => Promise<void>;
  fetchCosts: () => Promise<void>;
  fetchMemoryStats: () => Promise<void>;
  searchMemory: (q?: string) => Promise<void>;
  fetchSecurity: () => Promise<void>;
  fetchRouting: () => Promise<void>;
  fetchReasoning: () => Promise<void>;
  fetchBatches: () => Promise<void>;
  createMission: (title: string, description: string, priority: number) => Promise<void>;

  fetchGoals: () => Promise<void>;
  fetchEscalation: () => Promise<void>;
  fetchReporting: (period?: number) => Promise<void>;
  fetchPlugins: () => Promise<void>;

  toggleMute: () => void;
  setVoiceState: (s: VoiceState) => void;
  setActiveEmployee: (slug: string | null) => void;
  pushTranscript: (entry: { role: "you" | "agent"; text: string; via?: string }) => void;
  pushTimelineEvent: (event: ActivityEvent) => void;
}

let transcriptId = 0;

const safe = async <T,>(
  fn: () => Promise<T>,
  fallback: T,
  key: string,
  set: (partial: Partial<BladeState> | ((s: BladeState) => Partial<BladeState>)) => void,
): Promise<T> => {
  set((s) => ({ loading: { ...s.loading, [key]: true }, errors: { ...s.errors, [key]: null } }));
  try {
    const result = await fn();
    return result;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[blade-store]", key, e);
    set((s) => ({ errors: { ...s.errors, [key]: msg } }));
    return fallback;
  } finally {
    set((s) => ({ loading: { ...s.loading, [key]: false } }));
  }
};

export const useBladeStore = create<BladeState>((set, get) => ({
  health: null,
  employees: [],
  missions: [],
  memories: [],
  memoryStats: null,
  jobs: [],
  batchRuns: [],
  securityStats: null,
  securityEvents: [],
  routingStats: null,
  routingEpisodes: [],
  qValues: [],
  reasoningPatterns: [],
  reasoningStats: null,
  timeline: [],
  todayCost: 0,

  goals: [],
  escalationRules: [],
  escalationEvents: [],
  reportingMetrics: null,
  reportingEmployees: [],
  reportingPeriod: 7,
  plugins: [],

  voiceState: "listening",
  isMuted: false, // always-on ambient — push to mute, not push to talk
  activeEmployee: null,
  transcript: [],

  loading: {},
  errors: {},

  fetchHealth: async () => {
    const health = await safe(() => api.health(), null, "health", set);
    set({ health });
  },
  fetchEmployees: async () => {
    const employees = await safe(() => api.employees(), [], "employees", set);
    set({ employees: employees ?? [] });
  },
  fetchMissions: async () => {
    const missions = await safe(() => api.missions(), [], "missions", set);
    set({ missions: missions ?? [] });
  },
  fetchJobs: async () => {
    const jobs = await safe(() => api.jobs(), [], "jobs", set);
    set({ jobs: jobs ?? [] });
  },
  fetchTimeline: async () => {
    const t = await safe(() => api.timeline(20), { events: [] }, "timeline", set);
    set({ timeline: t?.events ?? [] });
  },
  fetchCosts: async () => {
    const c = await safe(() => api.costs("today"), { totalCostUsd: 0 }, "costs", set);
    set({ todayCost: c?.totalCostUsd ?? 0 });
  },
  fetchMemoryStats: async () => {
    const m = await safe(() => api.memoryStats(), { total: 0 }, "memoryStats", set);
    set({ memoryStats: m });
  },
  searchMemory: async (q = "") => {
    const memories = await safe(() => api.memorySearch(q), [], "searchMemory", set);
    set({ memories: memories ?? [] });
  },
  fetchSecurity: async () => {
    const [stats, events] = await Promise.all([
      safe(() => api.securityStats(), { injectionsToday: 0, exfiltrationsToday: 0, severity: "clear" } as SecurityStats, "securityStats", set),
      safe(() => api.securityEvents(20), [] as SecurityEvent[], "securityEvents", set),
    ]);
    set({ securityStats: stats, securityEvents: events ?? [] });
  },
  fetchRouting: async () => {
    const [stats, episodes, qValues] = await Promise.all([
      safe(() => api.routingStats(), { taskTypes: [] } as RoutingStats, "routingStats", set),
      safe(() => api.routingEpisodes(20), [] as RoutingEpisode[], "routingEpisodes", set),
      safe(() => api.routingQValues(), [] as QValue[], "routingQValues", set),
    ]);
    set({ routingStats: stats, routingEpisodes: episodes ?? [], qValues: qValues ?? [] });
  },
  fetchReasoning: async () => {
    const [stats, patterns] = await Promise.all([
      safe(() => api.reasoningStats(), { total: 0 } as ReasoningStats, "reasoningStats", set),
      safe(() => api.reasoningPatterns(undefined, 20), [] as ReasoningPattern[], "reasoningPatterns", set),
    ]);
    set({ reasoningStats: stats, reasoningPatterns: patterns ?? [] });
  },
  fetchBatches: async () => {
    const batches = await safe(() => api.autopilotBatches(), [], "batches", set);
    set({ batchRuns: batches ?? [] });
  },

  createMission: async (title, description, priority) => {
    try {
      await api.createMission({ title, description, priority });
      await get().fetchMissions();
    } catch (e) {
      console.error("createMission failed", e);
      throw e;
    }
  },

  fetchGoals: async () => {
    const goals = await safe(() => api.goals(), [], "goals", set);
    set({ goals: goals ?? [] });
  },
  fetchEscalation: async () => {
    const [rules, events] = await Promise.all([
      safe(() => api.escalationRules(), [] as EscalationRule[], "escalationRules", set),
      safe(() => api.escalationEvents(), [] as EscalationEvent[], "escalationEvents", set),
    ]);
    set({ escalationRules: rules ?? [], escalationEvents: events ?? [] });
  },
  fetchReporting: async (period = 7) => {
    set({ reportingPeriod: period });
    const [metrics, employees] = await Promise.all([
      safe(() => api.reportingMetrics(period), null as ReportingMetrics | null, "reportingMetrics", set),
      safe(() => api.reportingEmployees(period), [] as ReportingEmployee[], "reportingEmployees", set),
    ]);
    set({ reportingMetrics: metrics, reportingEmployees: employees ?? [] });
  },
  fetchPlugins: async () => {
    const plugins = await safe(() => api.plugins(), [], "plugins", set);
    set({ plugins: plugins ?? [] });
  },

  refreshAll: async () => {
    await Promise.all([
      get().fetchHealth(),
      get().fetchEmployees(),
      get().fetchMissions(),
      get().fetchJobs(),
      get().fetchTimeline(),
      get().fetchCosts(),
      get().fetchMemoryStats(),
      get().fetchSecurity(),
      get().fetchRouting(),
      get().fetchReasoning(),
      get().fetchBatches(),
    ]);
  },

  toggleMute: () => set((s) => ({ isMuted: !s.isMuted })),
  setVoiceState: (voiceState) => set({ voiceState }),
  setActiveEmployee: (slug) => set({ activeEmployee: slug }),
  pushTranscript: (entry) =>
    set((s) => ({
      transcript: [...s.transcript, { id: ++transcriptId, ...entry }].slice(-50),
    })),
  pushTimelineEvent: (event) =>
    set((s) => ({ timeline: [event, ...s.timeline].slice(0, 50) })),
}));
