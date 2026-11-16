/**
 * Typed authoring styles for layers and boxes. `compileStyle` turns the narrow `Layout` and
 * `Appearance` props into an ordinary inline style object, so layout stays browser HTML/CSS layout
 * rather than a custom layout engine. Framework adapters (the React `Surface` and `Box`, the
 * experimental worker surface) bind it as their element's inline style.
 * Not to be confused with the opt-in build-time CSS compiler in `packages/css-compiler`.
 */

/**
 * Typed layout for an authored layer or box. Numbers are CSS pixels. `x`/`y` position a
 * `Surface` inside the Underglass root (ignored for `Box`, which stays in flow); `direction`
 * makes the element a flex container and `gap` applies only then. `overflow: "scroll"` maps
 * to CSS `overflow: auto`.
 */
export interface Layout {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  padding?: number;
  gap?: number;
  direction?: "row" | "column";
  overflow?: "visible" | "hidden" | "scroll";
}
/**
 * Typed appearance for an authored layer or box. Colors are any CSS color the browser accepts
 * (checked with `CSS.supports`); `borderWidth`, `radius` and `fontSize` are CSS pixels.
 */
export interface Appearance {
  background?: string;
  color?: string;
  borderColor?: string;
  borderWidth?: number;
  radius?: number;
  fontSize?: number;
}

/**
 * The inline style `compileStyle` returns: camelCase CSS properties with complete string values
 * (lengths carry `px`), so React, Vue and `Object.assign(element.style, style)` all accept it
 * unchanged. Properties the authored layout and appearance leave unset are absent.
 */
export interface CompiledStyle {
  boxSizing: "border-box";
  position?: "absolute";
  left?: string;
  top?: string;
  width?: string;
  height?: string;
  padding?: string;
  display?: "flex";
  flexDirection?: "row" | "column";
  gap?: string;
  overflow: "visible" | "hidden" | "auto";
  backgroundColor?: string;
  color?: string;
  borderColor?: string;
  borderWidth?: string;
  borderStyle?: "solid";
  borderRadius?: string;
  fontSize?: string;
}

// CSS pixels as a complete length; `undefined` stays unset.
const px = (value: number | undefined) => value === undefined ? undefined : `${value}px`;

/**
 * Compiles typed layout and appearance into an inline style object. `positioned` (used for
 * layers) adds `position: absolute` at `layout.x`/`layout.y`. Throws on a non-finite number,
 * a negative number (only `x`/`y` may be negative) or a color the browser does not support.
 */
/** Anything that cannot be part of a colour: a second declaration, a rule, markup, an escape, a comment, or a function that loads or draws an image. */
const notColor = /[;{}<>\\!"']|\/\*|\b(?:url|image|image-set|cross-fade|element|paint|[a-z-]*gradient)\s*\(/i;
/**
 * Whether `value` is a colour for `property`. The browser decides (`CSS.supports`). Without a DOM (the
 * application is being prerendered) there is none to ask: the value is then only refused when it holds
 * something no colour does, and the browser checks it fully when the same tree hydrates.
 */
function validColor(property: string, value: string) {
  if (typeof CSS !== "undefined" && typeof CSS.supports === "function") return CSS.supports(property, value);
  return value.trim().length > 0 && !notColor.test(value);
}
export function compileStyle(layout: Layout = {}, appearance: Appearance = {}, positioned = false): CompiledStyle {
  for (const [key, value] of Object.entries({ ...layout, ...appearance })) {
    if (typeof value === "number" && (!Number.isFinite(value) || value < 0 && key !== "x" && key !== "y")) {
      throw new Error(`Invalid authored ${key}`);
    }
  }
  // Only string appearance fields are colors; `background` is restricted to a plain color.
  for (const [key, value] of Object.entries(appearance)) {
    if (typeof value === "string" && !validColor(key === "background" ? "background-color" : "color", value)) {
      throw new Error(`Invalid authored color: ${key}`);
    }
  }
  const style: CompiledStyle = {
    boxSizing: "border-box",
    ...(positioned ? { position: "absolute", left: px(layout.x ?? 0), top: px(layout.y ?? 0) } : {}),
    width: px(layout.width), height: px(layout.height), padding: px(layout.padding),
    ...(layout.direction ? { display: "flex", flexDirection: layout.direction, gap: px(layout.gap) } : {}),
    overflow: layout.overflow === "scroll" ? "auto" : layout.overflow ?? "visible",
    backgroundColor: appearance.background, color: appearance.color,
    borderColor: appearance.borderColor, borderWidth: px(appearance.borderWidth),
    // CSS draws no border without a style, so a nonzero width implies a solid border.
    borderStyle: appearance.borderWidth ? "solid" : undefined,
    borderRadius: px(appearance.radius), fontSize: px(appearance.fontSize),
  };
  // Drop unset properties so assigning the object to `element.style` never writes "undefined".
  for (const key of Object.keys(style) as (keyof CompiledStyle)[]) if (style[key] === undefined) delete style[key];
  return style;
}
