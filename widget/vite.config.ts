import { defineConfig } from "vite";

// Builds public/widget/anytill.js: one ES module, served by the app at /widget/anytill.js.
// The EVM wallet transfer (viem) is split into a lazy chunk that only loads when a buyer pays from a wallet.
export default defineConfig({
  build: {
    outDir: "../public/widget",
    emptyOutDir: true,
    target: "es2022",
    lib: { entry: "src/index.ts", formats: ["es"], fileName: () => "anytill.js" },
    rollupOptions: { output: { chunkFileNames: "chunks/[name]-[hash].js" } },
  },
});
