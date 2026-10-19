/**
 * Dialog and Drawer for Vue 3 (anatomy pages `dialog.md`, `drawer.md`): modal top-level panels at the modal level,
 * teleported into a container (the page body by default) with a scrim before them, never inside a layer. The modal
 * behaviour (inert background, focus, Escape, motion) is `showStrataDialog` from `@underglass/ui/dom`, shared with the
 * other bindings. Closed, they render nothing; closing keeps the panel mounted until its leave motion has finished.
 * Attributes fall through to the panel, and a template ref exposes it as `panel`.
 */
import { defineComponent, h, mergeProps, ref, Teleport, useId, watch, type PropType } from "vue";
import { showStrataDialog, type DialogCloseReason } from "../dom/dialog.ts";
import { dialogForm, drawerForm } from "../shared/structure-forms.ts";
import { classes, strataAttributes, strataProps } from "./shared.ts";

function modal(part: "dialog" | "drawer") {
  const name = part === "dialog" ? "StrataDialog" : "StrataDrawer";
  return defineComponent({
    name,
    inheritAttrs: false,
    props: {
      /** Whether the panel is shown. */
      open: { type: Boolean, required: true },
      /** The visible title, which names the panel. */
      title: { type: String, required: true },
      titleId: { type: String, default: undefined },
      /** The description's id; generated when absent. */
      descriptionId: { type: String, default: undefined },
      /** A paragraph at the start of the body that describes the panel (`aria-describedby`). */
      description: { type: String, default: undefined },
      /** Where the panel and its scrim are rendered: a selector or an element; `body` by default. */
      container: { type: [String, Object] as PropType<string | HTMLElement>, default: "body" },
      /** The element that takes focus on open; the first `[autofocus]` or tabbable element by default. */
      initialFocus: { type: Object as PropType<HTMLElement>, default: undefined },
      /** The element that takes focus on close; the element that had focus before opening by default. */
      returnFocus: { type: Object as PropType<HTMLElement>, default: undefined },
      /** Whether a click on the scrim asks to close; false by default, as for a native `<dialog>`. */
      closeOnScrim: { type: Boolean, default: false },
      /** `plate` (a Dialog) or `tray` (a Drawer): the hardware form; `flush` or none is the panel of before. */
      form: { type: String as PropType<"plate" | "tray" | "flush">, default: undefined },
      /** Drawer only: the edge it sits on. */
      ...(part === "drawer" ? { side: { type: String as PropType<"start" | "end" | "top" | "bottom">, default: "end" } } : {}),
      ...strataProps,
    },
    /** Emitted when the user asks to close (Escape, or the scrim with `closeOnScrim`); set `open` to false to close. */
    emits: { close: (_reason: DialogCloseReason) => true },
    setup(props, { attrs, slots, emit, expose }) {
      const generated = useId().replace(/[^a-zA-Z0-9_-]/g, "");
      // Mounted while open and while leaving.
      const present = ref(props.open);
      const panel = ref<HTMLElement | null>(null);
      expose({ panel });
      watch(() => props.open, open => { if (open) present.value = true; });
      // After the panel is in the container and before paint.
      watch(() => (props.open ? panel.value : null), (element, _previous, onCleanup) => {
        if (!element) return;
        const handle = showStrataDialog(element, {
          onClose: reason => emit("close", reason),
          get initialFocus() { return props.initialFocus; },
          get returnFocus() { return props.returnFocus; },
          get closeOnScrim() { return props.closeOnScrim; },
        });
        onCleanup(() => { void handle.close().then(() => { if (!props.open) present.value = false; }); });
      }, { flush: "post", immediate: true });

      return () => {
        if (!present.value || typeof document === "undefined") return null;
        const id = props.titleId ?? `${part}-title-${generated}`;
        const descriptionId = props.descriptionId ?? `${part}-description-${generated}`;
        const side = (props as { side?: string }).side;
        const formed = part === "dialog" ? dialogForm(props.form) : drawerForm(props.form);
        return h(Teleport, { to: props.container }, [
          h("div", { class: "ug-scrim", "aria-hidden": "true" }),
          h("section", mergeProps({
            ref: panel,
            class: classes("ug-panel", `ug-${part}`, part === "drawer" && `ug-drawer--${side}`),
            role: "dialog", "aria-modal": "true", "aria-labelledby": id,
            "aria-describedby": props.description !== undefined ? descriptionId : undefined,
            "data-strata-face": "raised", "data-strata-elevation": "modal", tabindex: "-1", ...(formed ? { "data-strata-form": formed } : {}), ...strataAttributes(props),
          }, attrs), [
            h("h2", { class: `ug-${part}__title`, id }, props.title),
            h("div", { class: `ug-${part}__body` }, [
              props.description !== undefined && h("p", { class: `ug-${part}__description`, id: descriptionId }, props.description),
              slots.default?.(),
            ]),
            slots.actions && h("div", { class: `ug-${part}__actions` }, slots.actions()),
          ]),
        ]);
      };
    },
  });
}

export const Dialog = modal("dialog");
export const Drawer = modal("drawer");
