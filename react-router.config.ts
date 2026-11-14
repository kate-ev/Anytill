import type { Config } from "@react-router/dev/config";
import { vercelPreset } from "@vercel/react-router/vite";

// The Vercel preset only applies on Vercel (VERCEL=1 during `vercel build`); local, test and Render builds are unchanged.
export default {
  ssr: true,
  presets: process.env.VERCEL ? [vercelPreset()] : [],
} satisfies Config;
