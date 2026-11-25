import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Relative base so the build works on GitHub Pages and on a custom domain.
  base: "./",
  // Bundled label models (src/models), imported with ?inline.
  assetsInclude: ["**/*.stl"],
  build: { chunkSizeWarningLimit: 1500 },
});
