import { defineConfig } from "vite";

export default defineConfig({
  base: "/lexXtract-general-law/",
  root: "./",
  publicDir: false,
  build: {
    outDir: "./docs",
    emptyOutDir: true,
  },
});
