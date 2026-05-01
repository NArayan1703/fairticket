import { defineConfig } from "vite";

export default defineConfig({
  define: {
    global: "globalThis",
  },
  optimizeDeps: {
    include: ["buffer"],
  },
  resolve: {
    alias: {
      buffer: "buffer/",
    },
  },
});
