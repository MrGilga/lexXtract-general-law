import { defineConfig } from "vite";

export default defineConfig({
  base: "/lexXtract-general-law/",
  root: "./",
  publicDir: "public",
  build: {
    outDir: "./docs",
    emptyOutDir: true,
  },
});
