/**
 * Gauge (anatomy page `gauge.md`): a native `<meter>` (role `meter`) under a round dial: a needle on a printed arc
 * (`gauge.sweep`, 240°), under glass, with a red zone below `low` and above `high` when they are given, and its legend
 * printed under the dial. A Gauge shows a bounded measurement; an indeterminate wait is a Spinner, and a task's progress
 * a ProgressBar. `unit` or `format` gives `aria-valuetext`. The ref and `className`, `style` and other attributes reach
 * the `.ug-meter.ug-gauge` root; `meterRef` reaches the native meter. The needle follows the value on `spring.gauge`.
 */
import { forwardRef } from "react";
import { MeterRoot, type MeterProps } from "./Meter.tsx";

export interface GaugeProps extends Omit<MeterProps, "form" | "segments" | "peak"> {}

export const Gauge = forwardRef<HTMLDivElement, GaugeProps>(function Gauge(props, ref) {
  return <MeterRoot ref={ref} form="dial" {...props} />;
});
