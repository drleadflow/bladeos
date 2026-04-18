export type AgentId = "gemini" | "nova" | "echo" | "muse" | "forge";

export interface Agent {
  id: AgentId;
  name: string;
  role: string;
  short: string;
  color: string; // hex/oklch for inline styling
  glow: string;
  domains: string[];
}

export const AGENTS: Record<AgentId, Agent> = {
  gemini: {
    id: "gemini",
    name: "Gemini",
    role: "Chief of Staff",
    short: "The voice. Triages everything, delegates to specialists, reports back results.",
    color: "#DC2626",
    glow: "rgba(220,38,38,0.6)",
    domains: ["all"],
  },
  nova: {
    id: "nova",
    name: "Nova",
    role: "Research",
    short: "Investigates, synthesizes, validates information with evidence. Health + wealth.",
    color: "#7C3AED",
    glow: "rgba(124,58,237,0.6)",
    domains: ["health", "wealth"],
  },
  echo: {
    id: "echo",
    name: "Echo",
    role: "Comms",
    short: "Messaging, relationship building, outreach, communication strategy.",
    color: "#2563EB",
    glow: "rgba(37,99,235,0.6)",
    domains: ["business", "relationships"],
  },
  muse: {
    id: "muse",
    name: "Muse",
    role: "Content",
    short: "Writes copy, designs content, manages social presence. Creative + brand work.",
    color: "#D97706",
    glow: "rgba(217,119,6,0.6)",
    domains: ["creative", "brand"],
  },
  forge: {
    id: "forge",
    name: "Forge",
    role: "Ops",
    short: "Systems, automation, code deployment, infrastructure, process optimization.",
    color: "#6B7280",
    glow: "rgba(5,150,105,0.6)",
    domains: ["ops", "infra"],
  },
};

export const AGENT_LIST: Agent[] = [
  AGENTS.gemini,
  AGENTS.nova,
  AGENTS.echo,
  AGENTS.muse,
  AGENTS.forge,
];

export const SPECIALISTS = [AGENTS.nova, AGENTS.echo, AGENTS.muse, AGENTS.forge];
