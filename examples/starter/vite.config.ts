import { defineConfig } from "vite";

// No plugins needed: Vite compiles TSX itself (the JSX runtime comes from tsconfig.json).
export default defineConfig({
  // One copy of React for your code and for Underglass.
  resolve: { dedupe: ["react", "react-dom"] },
});
