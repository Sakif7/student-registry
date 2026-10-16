// A thin bar for how much of a whole is done, e.g. the credits registered of
// a year's. It is only a picture, hidden from screen readers: the figures
// are always written beside it. Without a tone it is a plain chart bar.
import { cn } from "cn";

import { type Tone, TONE_COLOURS } from "./tone";

export function Meter({
  value,
  max,
  tone,
  className,
}: {
  value: number;
  max: number;
  /** Colours the fill when the figure is good or needs attention. */
  tone?: Tone;
  className?: string;
}) {
  const share = max > 0 ? Math.min(Math.max(value / max, 0), 1) : 0;
  return (
    <div
      aria-hidden
      className={cn("h-1.5 overflow-hidden rounded-full bg-muted", className)}
    >
      <div
        className={cn(
          "h-full rounded-full",
          tone ? TONE_COLOURS[tone] : "bg-chart-primary",
        )}
        style={{ width: `${share * 100}%` }}
      />
    </div>
  );
}
