// Prepares the database for whichever backend DATABASE_URL points at.
//   postgres://… or postgresql://…  → generate a Postgres client from the same models and `prisma db push`
//   file:… (or unset locally)       → SQLite: generate + apply migrations (local default, Render)
//   on Vercel with no DATABASE_URL  → generate only; the app creates a resetting SQLite store in /tmp
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const run = (args) => execFileSync(process.platform === "win32" ? "node_modules\\.bin\\prisma.cmd" : "node_modules/.bin/prisma", args, { stdio: "inherit", env: process.env });

if (!process.env.VERCEL && !existsSync(".env") && !process.env.DATABASE_URL) {
  copyFileSync(".env.example", ".env");
  console.log("Created .env from .env.example (demo mode, no keys).");
}

// Marketplace Postgres add-ons may set DATABASE_URL to a proxy URL (e.g. prisma+postgres://) and put the
// direct connection in POSTGRES_URL; use the direct one so the schema push and the runtime client agree.
const isPg = (u) => /^postgres(ql)?:\/\//.test(u || "");
if (!isPg(process.env.DATABASE_URL) && !/^file:/.test(process.env.DATABASE_URL || "") && isPg(process.env.POSTGRES_URL)) {
  process.env.DATABASE_URL = process.env.POSTGRES_URL;
}
const url = process.env.DATABASE_URL || "";
if (/^postgres(ql)?:\/\//.test(url)) {
  // One set of models: the Postgres schema is derived from prisma/schema.prisma by swapping the provider.
  mkdirSync("prisma/.generated", { recursive: true });
  const schema = readFileSync("prisma/schema.prisma", "utf8").replace('provider = "sqlite"', 'provider = "postgresql"');
  writeFileSync("prisma/.generated/postgres.prisma", schema);
  run(["generate", "--schema", "prisma/.generated/postgres.prisma"]);
  run(["db", "push", "--schema", "prisma/.generated/postgres.prisma", "--skip-generate"]);
  console.log("Database: Postgres (schema pushed).");
} else if (process.env.VERCEL && !url) {
  run(["generate"]);
  console.log("Database: none configured; the app uses a resetting SQLite demo store in /tmp.");
} else {
  run(["generate"]);
  run(["migrate", "deploy"]);
  console.log("Database: SQLite (migrations applied).");
}
