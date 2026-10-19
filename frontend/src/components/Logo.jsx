/**
 * Logo — "Teashore" wordmark with a gradient wave underneath.
 *
 * Props:
 *   size      — "sm" | "md" | "lg" | "xl"
 *   light     — boolean, flips text to cream for dark backgrounds
 *   className — extra classes on the root <svg>
 *
 * Also exports:
 *   AnimatedWave — standalone wave that draws itself in on mount (used in Hero)
 */
import { motion } from "motion/react";

const SIZE_MAP = {
  sm: { width: 120, height: 44,  textY: 26, fontSize: 22, waveY: 36, waveH: 8  },
  md: { width: 180, height: 66,  textY: 38, fontSize: 33, waveY: 52, waveH: 12 },
  lg: { width: 260, height: 92,  textY: 54, fontSize: 47, waveY: 72, waveH: 18 },
  xl: { width: 340, height: 122, textY: 70, fontSize: 62, waveY: 94, waveH: 24 },
};

/** Build the S-curve wave path string */
function buildWavePath(w, y0, waveH) {
  const amp = waveH * 0.6;
  const cp  = waveH * 1.0;
  return [
    `M 0 ${y0}`,
    `C ${w * 0.15} ${y0 - cp},  ${w * 0.35} ${y0 + amp},  ${w * 0.5} ${y0}`,
    `C ${w * 0.65} ${y0 - amp},  ${w * 0.85} ${y0 + cp},  ${w} ${y0}`,
  ].join(" ");
}

/** Static Logo — wordmark + wave (no draw-in animation) */
export default function Logo({ size = "md", light = false, className = "" }) {
  const s = SIZE_MAP[size] ?? SIZE_MAP.md;
  const textFill = light ? "#fdf6ee" : "#4a3325";
  const wavePath = buildWavePath(s.width, s.waveY, s.waveH);
  const gradId   = `wave-grad-${size}`;
  const strokeW  = size === "sm" ? 1.4 : size === "xl" ? 3.0 : 2.0;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${s.width} ${s.height}`}
      width={s.width}
      height={s.height}
      role="img"
      aria-label="Teashore logo"
      className={className}
    >
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor="#f0b56e" />
          <stop offset="50%"  stopColor="#c68b59" />
          <stop offset="100%" stopColor="#4a3325" />
        </linearGradient>
      </defs>

      <text
        x={s.width / 2}
        y={s.textY}
        textAnchor="middle"
        fontFamily='"Playfair Display", Georgia, serif'
        fontSize={s.fontSize}
        fontWeight="500"
        letterSpacing="-0.02em"
        fill={textFill}
      >
        Teashore
      </text>

      <path
        d={wavePath}
        fill="none"
        stroke={`url(#${gradId})`}
        strokeWidth={strokeW}
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * AnimatedWave — a standalone draw-in wave for use in the Hero.
 * Animates `pathLength` from 0 → 1 on mount.
 *
 * Props:
 *   width   — SVG width  (default 340)
 *   height  — SVG height (default 32)
 *   delay   — animation start delay in seconds (default 1.2)
 */
export function AnimatedWave({ width = 340, height = 32, delay = 1.2 }) {
  const y0     = height * 0.62;
  const waveH  = height * 0.72;
  const wavePath = buildWavePath(width, y0, waveH);

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      aria-hidden="true"
      style={{ overflow: "visible" }}
    >
      <defs>
        <linearGradient id="hero-wave-grad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor="#f0b56e" />
          <stop offset="50%"  stopColor="#c68b59" />
          <stop offset="100%" stopColor="#4a3325" />
        </linearGradient>
      </defs>

      {/* Shadow/glow duplicate behind */}
      <motion.path
        d={wavePath}
        fill="none"
        stroke="#c68b59"
        strokeWidth={6}
        strokeLinecap="round"
        opacity={0.18}
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ delay: delay + 0.05, duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
      />

      {/* Main gradient wave */}
      <motion.path
        d={wavePath}
        fill="none"
        stroke="url(#hero-wave-grad)"
        strokeWidth={3}
        strokeLinecap="round"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ delay, duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
      />
    </svg>
  );
}
