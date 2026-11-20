/**
 * Menu for Vue 3 (anatomy page `menu.md`), the WAI-ARIA Menu Button pattern on the native Popover API: the `trigger`
 * slot's one element gets `popovertarget` and `aria-haspopup="menu"`; the menu (`popover`, `role="menu"`) is teleported
 * to `to` (`body` by default), outside every Underglass layer. `attachStrataMenus` runs its keys.
 */
import { Fragment, Teleport, cloneVNode, defineComponent, h, useId, type PropType } from "vue";
import { attachStrataMenus } from "../dom/menu.ts";
import { useStrataDelegates } from "./delegates.ts";
import { attachStrataPopovers } from "../dom/popover.ts";

export type MenuEntry = { label: string; onSelect?: () => void; disabled?: boolean } | "separator";

export const Menu = defineComponent({
  name: "StrataMenu",
  props: {
    /** The menu's name. */
    label: { type: String, required: true },
    items: { type: Array as PropType<readonly MenuEntry[]>, required: true },
    id: { type: String, default: undefined },
    /** Prefer above the button. */
    placement: { type: String as PropType<"top" | "bottom">, default: "bottom" },
    /** Where the menu is teleported; `body` by default. Never inside an Underglass layer. */
    to: { type: [String, Object] as PropType<string | Element>, default: "body" },
  },
  setup(props, { slots }) {
    const generated = (useId() ?? "").replace(/[^a-zA-Z0-9_-]/g, "");
    useStrataDelegates(() => [attachStrataMenus, attachStrataPopovers]);
    return () => {
      const menuId = props.id ?? `menu-${generated}`;
      const [trigger] = slots.trigger?.() ?? [];
      return h(Fragment, [
        trigger && cloneVNode(trigger, { popovertarget: menuId, "aria-haspopup": "menu" }),
        h(Teleport, { to: props.to, defer: true }, [h("div", {
          class: "ug-menu", "data-strata-face": "raised", id: menuId, popover: "", role: "menu", "aria-label": props.label,
          "data-strata-placement": props.placement === "top" ? "top" : undefined,
        }, props.items.map((entry, at) => entry === "separator"
          ? h("hr", { key: at, class: "ug-menu__separator" })
          : h("button", { key: at, class: "ug-menu__item", type: "button", role: "menuitem", tabindex: "-1", "aria-disabled": entry.disabled ? "true" : undefined,
            onClick: entry.disabled ? undefined : entry.onSelect }, entry.label)))]),
      ]);
    };
  },
});
