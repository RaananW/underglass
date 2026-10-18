/**
 * Gauge for Vue 3 (anatomy page `gauge.md`): a native `<meter>` (role `meter`) under a round dial: a needle on a printed
 * arc (`gauge.sweep`, 240°), under glass, with a red zone below `low` and above `high` when they are given, and its legend
 * printed under the dial. A Gauge shows a bounded measurement; an indeterminate wait is a Spinner, and a task's progress a
 * ProgressBar. Attributes and listeners (`class` and `style` included) fall through to the `.ug-meter.ug-gauge` root; the
 * component exposes `root` and `meter`. The needle follows the value on `spring.gauge`.
 */
import { defineComponent, onMounted, ref, useId } from "vue";
import { attachStrataMeters } from "../dom/meter.ts";
import { meterProps, renderMeter } from "./meter.ts";

export const Gauge = defineComponent({
  name: "StrataGauge",
  props: meterProps,
  setup(props, { expose }) {
    const generated = (useId() ?? "").replace(/[^a-zA-Z0-9_-]/g, "");
    const root = ref<HTMLElement>(), meter = ref<HTMLMeterElement>();
    expose({ root, meter });
    onMounted(() => attachStrataMeters());
    return () => renderMeter(props, "dial", generated, { root, meter });
  },
});
