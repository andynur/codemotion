import { useCallback, useEffect, useState } from "react";
import { motionDurationMs } from "../stage/motion";

export function usePlayback(length: number) {
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const clamp = useCallback((index: number) => Math.max(0, Math.min(Math.max(0, length - 1), index)), [length]);

  useEffect(() => { setCurrent((index) => clamp(index)); if (length < 2) setPlaying(false); }, [clamp, length]);
  useEffect(() => {
    if (!playing) return;
    const interval = motionDurationMs() * 2 / speed;
    if (!interval) return;
    const timer = window.setInterval(() => setCurrent((index) => {
      if (index >= length - 1) { setPlaying(false); return index; }
      return index + 1;
    }), interval);
    return () => clearInterval(timer);
  }, [length, playing, speed]);

  return {
    current,
    playing,
    speed,
    setCurrent: (index: number) => setCurrent(clamp(index)),
    setSpeed,
    toggle: () => setPlaying((value) => !value),
    back: () => setCurrent((index) => clamp(index - 1)),
    forward: () => setCurrent((index) => clamp(index + 1)),
    reset: () => { setCurrent(0); setPlaying(false); },
  };
}
