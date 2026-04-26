import { useEffect, useRef, useState } from "react";

interface AnimatedCounterProps {
  value: number;
  duration?: number;
  suffix?: string;
  prefix?: string;
  decimals?: number;
}

export function AnimatedCounter({
  value,
  duration = 1500,
  suffix = "",
  prefix = "",
  decimals = 0,
}: AnimatedCounterProps) {
  const [display, setDisplay] = useState(0);
  const previousRef = useRef(0);

  useEffect(() => {
    if (value === 0) {
      setDisplay(0);
      previousRef.current = 0;
      return;
    }

    let startTime: number | null = null;
    const startValue = previousRef.current;
    let frameId = 0;

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = startValue + (value - startValue) * eased;
      setDisplay(current);

      if (progress < 1) {
        frameId = requestAnimationFrame(animate);
      } else {
        setDisplay(value);
        previousRef.current = value;
      }
    };

    frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId);
  }, [value, duration]);

  return (
    <span className="tabular-nums">
      {prefix}
      {display.toLocaleString("el-GR", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}
      {suffix}
    </span>
  );
}
