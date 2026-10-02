import type { Transition } from "motion/react";

function rootToken(name: string) {
  if (typeof document === "undefined") return "";
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Reads a duration token such as `--motion-duration-xlong` in milliseconds. */
export function tokenMs(name: string) {
  const token = rootToken(name);
  const value = Number.parseFloat(token);
  if (!Number.isFinite(value)) return 0;
  return token.endsWith("ms") ? value : value * 1_000;
}

export function motionDurationMs() {
  return tokenMs("--motion-duration-medium");
}

/** Time the flowchart takes to travel one edge. */
export function travelMs() {
  return prefersReducedMotion() ? 0 : tokenMs("--motion-duration-xlong");
}

export function stageTransition(): Transition {
  if (prefersReducedMotion()) return { duration: 0 };
  const milliseconds = motionDurationMs();
  const easing = rootToken("--motion-easing-out-practical").match(/[\d.]+/g)?.map(Number);
  return { duration: milliseconds / 1_000, ease: easing?.length === 4 ? easing as [number, number, number, number] : "easeOut" };
}
