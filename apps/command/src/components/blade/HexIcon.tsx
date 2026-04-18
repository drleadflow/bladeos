import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface Props {
  Icon: LucideIcon;
  active?: boolean;
  color?: string;
  size?: number;
  className?: string;
  onClick?: () => void;
}

export function HexIcon({ Icon, active, color = "#DC2626", size = 44, className, onClick }: Props) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "group relative flex items-center justify-center transition-all",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <svg
        viewBox="0 0 100 100"
        className="absolute inset-0"
        style={{
          filter: active ? `drop-shadow(0 0 8px ${color})` : undefined,
        }}
      >
        <polygon
          points="50,4 92,27 92,73 50,96 8,73 8,27"
          fill={active ? `${color}22` : "rgba(255,255,255,0.02)"}
          stroke={active ? color : "rgba(255,255,255,0.15)"}
          strokeWidth="1.5"
          className="transition-all group-hover:stroke-white/40"
        />
      </svg>
      {active && (
        <svg viewBox="0 0 100 100" className="absolute inset-0 blade-spin-slow">
          <circle
            cx="50" cy="50" r="44"
            fill="none"
            stroke={color}
            strokeWidth="1"
            strokeDasharray="6 280"
            opacity="0.8"
          />
        </svg>
      )}
      <Icon
        className="relative z-10 transition-colors"
        size={size * 0.4}
        color={active ? color : "rgba(255,255,255,0.55)"}
      />
    </button>
  );
}
