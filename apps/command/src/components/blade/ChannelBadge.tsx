const channelConfig: Record<string, { label: string; color: string }> = {
  dashboard: { label: "DASH", color: "#3B82F6" },
  telegram: { label: "TG", color: "#229ED9" },
  voice: { label: "VOICE", color: "#DC2626" },
};

export function ChannelBadge({ channel }: { channel?: string }) {
  if (!channel) return null;
  const cfg = channelConfig[channel] ?? { label: channel.toUpperCase(), color: "#666" };
  return (
    <span
      className="inline-block rounded-sm px-1 py-0.5 font-mono text-[8px] uppercase tracking-wider"
      style={{ background: `${cfg.color}22`, color: cfg.color, border: `1px solid ${cfg.color}44` }}
    >
      {cfg.label}
    </span>
  );
}
