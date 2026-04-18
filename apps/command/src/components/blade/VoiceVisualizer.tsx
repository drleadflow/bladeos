import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export type VizState = "idle" | "listening" | "speaking" | "thinking";

interface Props {
  state: VizState;
  dispatchTo?: { name: string; color: string } | null;
  size?: number;
}

export function VoiceVisualizer({ state, dispatchTo, size = 320 }: Props) {
  const [bars, setBars] = useState<number[]>(() => Array(48).fill(0.3));
  const raf = useRef(0);

  useEffect(() => {
    const animate = () => {
      setBars((prev) =>
        prev.map((_, i) => {
          if (state === "speaking") {
            return 0.3 + Math.abs(Math.sin(Date.now() / 180 + i * 0.5)) * 0.7;
          }
          if (state === "listening") {
            return 0.4 + Math.abs(Math.sin(Date.now() / 240 + i * 0.3)) * 0.5;
          }
          return 0.25 + Math.abs(Math.sin(Date.now() / 600 + i * 0.2)) * 0.15;
        }),
      );
      raf.current = requestAnimationFrame(animate);
    };
    raf.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf.current);
  }, [state]);

  const RED = "#DC2626";
  const cx = size / 2;
  const cy = size / 2;
  const baseR = size * 0.18;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      {/* Outer rotating arcs */}
      <svg viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 blade-spin-slower">
        <circle cx={cx} cy={cy} r={size * 0.46} fill="none" stroke={RED} strokeOpacity="0.15" strokeWidth="1" strokeDasharray="2 6" />
        <circle cx={cx} cy={cy} r={size * 0.46} fill="none" stroke={RED} strokeWidth="1.5" strokeDasharray="40 800" strokeLinecap="round" style={{ filter: `drop-shadow(0 0 6px ${RED})` }} />
      </svg>
      <svg viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 blade-spin-rev">
        <circle cx={cx} cy={cy} r={size * 0.4} fill="none" stroke={RED} strokeOpacity="0.2" strokeWidth="1" />
        <circle cx={cx} cy={cy} r={size * 0.4} fill="none" stroke={RED} strokeWidth="2" strokeDasharray="20 900" strokeLinecap="round" style={{ filter: `drop-shadow(0 0 8px ${RED})` }} />
      </svg>
      <svg viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 blade-spin-slow">
        <circle cx={cx} cy={cy} r={size * 0.34} fill="none" stroke={RED} strokeOpacity="0.25" strokeWidth="1" strokeDasharray="1 4" />
      </svg>

      {/* Orbiting particles */}
      {[0, 120, 240].map((deg, i) => (
        <motion.div
          key={i}
          className="absolute"
          style={{ inset: 0 }}
          animate={{ rotate: 360 }}
          transition={{ duration: 12 + i * 4, repeat: Infinity, ease: "linear" }}
        >
          <div
            className="absolute rounded-full"
            style={{
              width: 6, height: 6, background: RED,
              boxShadow: `0 0 10px ${RED}`,
              top: `${50 - 46}%`,
              left: "50%", transform: `translate(-50%, 0) rotate(${deg}deg) translateY(-${size * 0.46}px)`,
            }}
          />
        </motion.div>
      ))}

      {/* Listening expanding ripples */}
      <AnimatePresence>
        {state === "listening" && (
          <>
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="absolute rounded-full border"
                style={{ borderColor: RED, top: cy, left: cx }}
                initial={{ width: baseR * 2, height: baseR * 2, x: -baseR, y: -baseR, opacity: 0.6 }}
                animate={{ width: size, height: size, x: -size/2, y: -size/2, opacity: 0 }}
                transition={{ duration: 2, repeat: Infinity, delay: i * 0.6, ease: "easeOut" }}
              />
            ))}
          </>
        )}
      </AnimatePresence>

      {/* Core */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: baseR * 2, height: baseR * 2,
          top: cy - baseR, left: cx - baseR,
          background: `radial-gradient(circle, ${RED} 0%, #991B1B 60%, transparent 100%)`,
          boxShadow: `0 0 60px ${RED}, inset 0 0 40px rgba(255,255,255,0.3)`,
        }}
        animate={{
          scale: state === "listening" ? [1, 1.15, 1] : state === "speaking" ? [1, 1.08, 1] : [1, 1.04, 1],
        }}
        transition={{ duration: state === "speaking" ? 0.4 : 2.5, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Speaking radial frequency bars */}
      {state === "speaking" && (
        <svg viewBox={`0 0 ${size} ${size}`} className="absolute inset-0">
          {bars.map((h, i) => {
            const angle = (i / bars.length) * Math.PI * 2;
            const r1 = baseR + 4;
            const r2 = r1 + h * (size * 0.13);
            const x1 = cx + Math.cos(angle) * r1;
            const y1 = cy + Math.sin(angle) * r1;
            const x2 = cx + Math.cos(angle) * r2;
            const y2 = cy + Math.sin(angle) * r2;
            return (
              <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={RED} strokeWidth="2" strokeLinecap="round" style={{ filter: `drop-shadow(0 0 4px ${RED})` }} />
            );
          })}
        </svg>
      )}

      {/* Thinking scan line */}
      {state === "thinking" && (
        <motion.div
          className="absolute origin-center"
          style={{ top: cy - 1, left: cx, width: size * 0.45, height: 2, background: `linear-gradient(90deg, transparent, ${RED}, transparent)` }}
          animate={{ rotate: 360 }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "linear" }}
        />
      )}

      {/* Center label */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center">
          <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-white/70 blade-text-glow">
            {state}
          </div>
          {dispatchTo && state === "thinking" && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-1 font-mono text-[9px] uppercase tracking-wider"
              style={{ color: dispatchTo.color }}
            >
              → {dispatchTo.name}
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
