# Underglass starter

A tiny React + Vite app that shows [Underglass](https://underglass.dev/) working, ready to edit. One scene,
three ideas:

1. **Native controls stay native.** The text input and the button are ordinary React elements, drawn by the GPU
   but still typed into and clicked as the real elements.
2. **GPU motion.** The button wiggles the card with `gpu.transition(...)`, which only updates a matrix.
3. **A shader effect** (a ripple) runs on a separate decorative layer behind the card.

A status line under the stage says whether it runs in GPU or DOM mode and, in DOM mode, why.

## Try it

- In the browser: [Open in StackBlitz](https://stackblitz.com/github/RaananW/underglass/tree/main/examples/starter)
  (use Chrome or Edge 157 or later).
- Locally:

  ```sh
  npx degit RaananW/underglass/examples/starter my-app
  cd my-app
  npm install && npm run dev
  ```

## Browser

GPU mode needs **Chrome or Edge 157 or later**. Elsewhere the app runs as ordinary DOM with the same code, and
the status line explains why GPU mode is off.

## Files

- `src/main.tsx`: creates the hosts, mounts the app, calls `enable()`, and reports the status.
- `src/App.tsx`: the scene. Edit this first.
- `src/styles.css`: the styling.

## Next

- [Getting started](https://underglass.dev/docs/guide/getting-started)
- [Gallery](https://underglass.dev/)
