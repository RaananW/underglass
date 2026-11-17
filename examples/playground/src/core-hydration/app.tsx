/**
 * The application of `core-hydration.html`, rendered twice: in Node when the page is built (`prerender.tsx`) and in the
 * browser, where it is hydrated (`page.tsx`). Two `Surface` layers (one decorative), one element enrolled by ref, a
 * counting button, an input labelled through `useId`, and a `NativeOverlay`, which has no prerendered markup.
 */
import { useId, useState } from "react";
import { NativeOverlay, Surface, useSurfaceRef } from "@underglass/react";

export function App({ label = "Count" }: { label?: string }) {
  const [count, setCount] = useState(0);
  const enrolled = useSurfaceRef<HTMLDivElement>({ id: "enrolled" });
  const name = useId();
  return <>
    <Surface id="primary" layout={{ x: 40, y: 40, width: 260, height: 200, padding: 16 }} appearance={{ background: "rgb(240, 30, 60)" }}>
      <button id="count" type="button" onClick={() => setCount(value => value + 1)}>{label} {count}</button>
      <p><label htmlFor={name}>Name</label> <input id={name} className="name" defaultValue="" /></p>
    </Surface>
    <div ref={enrolled} id="enrolled" className="enrolled"><p>Enrolled by ref</p></div>
    <Surface id="art" decorative layout={{ x: 40, y: 270, width: 540, height: 110 }} appearance={{ background: "rgb(20, 150, 90)" }}>
      <span>Decoration</span>
    </Surface>
    <NativeOverlay><p id="overlay-note">In the overlay host</p></NativeOverlay>
  </>;
}
