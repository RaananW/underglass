/**
 * Popover for Vue 3 (anatomy page `popover.md`): interactive content one button opens beside itself, on the native
 * Popover API. The `trigger` slot's one element gets `popovertarget`; the popover (`popover`, `role="dialog"`, the
 * default slot) is teleported to `to` (`body` by default), outside every Underglass layer. The browser toggles,
 * dismisses and places it; `toggle(open)` reports it.
 */
import { Fragment, Teleport, cloneVNode, defineComponent, h, useId, type PropType } from "vue";
import { attachStrataPopovers } from "../dom/popover.ts";
import { useStrataDelegates } from "./delegates.ts";

export const Popover = defineComponent({
  name: "StrataPopover",
  props: {
    /** Names it, as its heading. */
    title: { type: String, default: undefined },
    /** Names it when there is no title. */
    label: { type: String, default: undefined },
    id: { type: String, default: undefined },
    /** Prefer above the button. */
    placement: { type: String as PropType<"top" | "bottom">, default: "bottom" },
    /** Where the popover is teleported; `body` by default. Never inside an Underglass layer. */
    to: { type: [String, Object] as PropType<string | Element>, default: "body" },
  },
  emits: { toggle: (open: boolean) => typeof open === "boolean" },
  setup(props, { slots, emit }) {
    const generated = (useId() ?? "").replace(/[^a-zA-Z0-9_-]/g, "");
    useStrataDelegates(() => [attachStrataPopovers]);
    return () => {
      const popoverId = props.id ?? `popover-${generated}`, titleId = `${popoverId}-title`;
      const [trigger] = slots.trigger?.() ?? [];
      return h(Fragment, [
        trigger && cloneVNode(trigger, { popovertarget: popoverId }),
        h(Teleport, { to: props.to, defer: true }, [h("div", {
          class: "ug-popover", "data-strata-face": "raised", id: popoverId, popover: "", role: "dialog",
          "aria-labelledby": props.title ? titleId : undefined, "aria-label": props.title ? undefined : props.label,
          "data-strata-placement": props.placement === "top" ? "top" : undefined,
          onToggle: (event: Event) => emit("toggle", (event as ToggleEvent).newState === "open"),
        }, [
          props.title && h("h2", { class: "ug-popover__title", id: titleId }, props.title),
          h("div", { class: "ug-popover__body" }, slots.default?.()),
        ])]),
      ]);
    };
  },
});
