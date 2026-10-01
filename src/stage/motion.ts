import type { Transition } from "motion/react";

function rootToken(name: string) {
  if (typeof document === "undefined") return "";
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function motionDurationMs() {
  const token = rootToken("--motion-duration-medium");
  const value = Number.parseFloat(token);
  return token.endsWith("ms") ? value : value * 1_000;
}

export function stageTransition(): Transition {
  if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return { duration: 0 };
  const milliseconds = motionDurationMs();
  const easing = rootToken("--motion-easing-out-practical").match(/[\d.]+/g)?.map(Number);
  return { duration: milliseconds / 1_000, ease: easing?.length === 4 ? easing as [number, number, number, number] : "easeOut" };
}
