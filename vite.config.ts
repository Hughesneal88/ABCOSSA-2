import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

const isNetlify = process.env.NETLIFY === "true";

export default defineConfig(() => ({
  base: isNetlify ? "/" : "/ABCOSSA/",
  build: {
    outDir: isNetlify ? "dist" : "docs",
  },
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
