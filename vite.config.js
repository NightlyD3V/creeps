import { defineConfig } from 'vite';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';  // For async imports

export default defineConfig({
  plugins: [
    wasm(),  // Handles .wasm loading
    topLevelAwait()  // Allows top-level await in modules
  ],
  optimizeDeps: {
    exclude: ['@dimforge/rapier3d']  // Prevents Vite from pre-bundling Rapier (causes WASM issues)
  },
  assetsInclude: ['**/*.wasm']  // Ensures WASM files are treated as assets
});