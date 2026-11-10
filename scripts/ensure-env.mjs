// Fresh clone: create .env from .env.example so demo mode runs with zero setup.
import { copyFileSync, existsSync } from "node:fs";
if (!existsSync(".env") && !process.env.DATABASE_URL) {
  copyFileSync(".env.example", ".env");
  console.log("Created .env from .env.example (demo mode, no keys).");
}
