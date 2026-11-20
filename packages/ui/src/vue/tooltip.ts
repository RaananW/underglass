/**
 * Tooltip for Vue 3 (anatomy page `tooltip.md`): a description shown while one trigger (the default slot's one
 * element) is hovered or focused. The trigger gets `aria-describedby`; the tooltip (`role="tooltip"`,
 * `popover="manual"`) is teleported to `to` (`body` by default), outside every Underglass layer; the teleport is
 * deferred, so `to` may be an element rendered in the same tree.
 */
import { Fragment, Teleport, cloneVNode, defineComponent, h, useId, type PropType } from "vue";
import { attachStrataTooltips } from "../dom/tooltip.ts";
import { useStrataDelegates } from "./delegates.ts";

export const Tooltip = defineComponent({
  name: "StrataTooltip",
  props: {
    content: { type: String, required: true },
    id: { type: String, default: undefined },
    placement: { type: String as PropType<"top" | "bottom">, default: "top" },
    /** Where the tooltip is teleported; `body` by default. Never inside an Underglass layer. */
    to: { type: [String, Object] as PropType<string | Element>, default: "body" },
  },
  setup(props, { slots }) {
    const generated = useId().replace(/[^a-zA-Z0-9_-]/g, "");
    useStrataDelegates(() => [attachStrataTooltips]);
    return () => {
      const tipId = props.id ?? `tooltip-${generated}`;
      const [trigger] = slots.default?.() ?? [];
      const describedBy = [trigger?.props?.["aria-describedby"], tipId].filter(Boolean).join(" ");
      return h(Fragment, [
        trigger && cloneVNode(trigger, { "aria-describedby": describedBy }),
        h(Teleport, { to: props.to, defer: true }, [h("div", { class: "ug-tooltip", id: tipId, role: "tooltip", popover: "manual", "data-strata-placement": props.placement === "bottom" ? "bottom" : undefined }, props.content)]),
      ]);
    };
  },
});
