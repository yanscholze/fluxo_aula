import { useId, useLayoutEffect, useRef, useState } from "react";
import {
  animate,
  m,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "motion/react";
export interface MotionOrigin {
  x: number;
  y: number;
}
export type ColorTransitionPhase = "covering" | "covered" | "revealing";
const colorTiming = { cover: 0.22, reveal: 0.42 } as const;

/** The current page stays intact until this opaque burst has covered the viewport. */
export function ColorTransition({
  origin,
  phase,
  onCovered,
  onComplete,
}: {
  origin: MotionOrigin;
  phase: ColorTransitionPhase;
  onCovered: () => void;
  onComplete: () => void;
}) {
  const reduced = useReducedMotion();
  const gradientId = useId();
  const [geometry] = useState(() => {
    const width = window.innerWidth,
      height = window.innerHeight;
    const start = {
      x: Math.max(0, Math.min(origin.x, width)),
      y: Math.max(0, Math.min(origin.y, height)),
    };
    const radius =
      Math.ceil(
        Math.hypot(
          Math.max(start.x, width - start.x),
          Math.max(start.y, height - start.y),
        ),
      ) + 32;
    return { start, radius, width, height };
  });
  const { start, radius, width, height } = geometry;
  const point = `${start.x}px ${start.y}px`;
  const outerRadius = useMotionValue(phase === "covering" ? 22 : radius);
  const revealRadius = useMotionValue(0);
  const clip = useMotionTemplate`circle(${outerRadius}px at ${point})`;
  // A single even-odd shape leaves the growing circle transparent, avoiding
  // a viewport-sized CSS alpha mask and its additional compositing pass.
  const aperture = useTransform(
    revealRadius,
    (r) =>
      `M 0 0 H ${width} V ${height} H 0 Z M ${start.x - r} ${start.y} a${r} ${r} 0 1 0 ${2 * r} 0 a${r} ${r} 0 1 0 ${-2 * r} 0 Z`,
  );
  const callbacks = useRef({ onCovered, onComplete });
  useLayoutEffect(() => {
    callbacks.current = { onCovered, onComplete };
  });
  useLayoutEffect(() => {
    if (reduced) return;
    if (phase === "covered") {
      outerRadius.set(radius);
      revealRadius.set(0);
      return;
    }
    const control =
      phase === "covering"
        ? animate(outerRadius, radius, {
            duration: colorTiming.cover,
            ease: [0.35, 0, 0.3, 1],
            onComplete: () => callbacks.current.onCovered(),
          })
        : animate(revealRadius, radius, {
            duration: colorTiming.reveal,
            ease: [0.45, 0, 0.3, 1],
            onComplete: () => callbacks.current.onComplete(),
          });
    return () => control.stop();
  }, [phase, reduced, outerRadius, revealRadius, radius]);
  if (reduced) return null;
  return (
    <div
      className="route-color-stage"
      aria-hidden="true"
      data-motion="color-transition"
      data-phase={phase}
    >
      {phase === "covering" && (
        <m.div
          className="route-color-orb"
          initial={{ x: start.x - 22, y: start.y - 22, scale: 1, opacity: 1 }}
          animate={{ scale: 1.8, opacity: 0 }}
          transition={{ duration: colorTiming.cover, ease: "easeOut" }}
        />
      )}
      <m.svg
        className="route-color-curtain"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{ clipPath: clip }}
      >
        <defs>
          <radialGradient
            id={gradientId}
            gradientUnits="userSpaceOnUse"
            cx={start.x}
            cy={start.y}
            r={radius}
          >
            <stop offset="0" stopColor="var(--burst-highlight)" />
            <stop offset=".58" stopColor="var(--burst-color)" />
            <stop offset="1" stopColor="var(--burst-depth)" />
          </radialGradient>
        </defs>
        <m.path
          className="route-color-aperture"
          d={aperture}
          fill={`url(#${gradientId})`}
          fillRule="evenodd"
        />
      </m.svg>
    </div>
  );
}
