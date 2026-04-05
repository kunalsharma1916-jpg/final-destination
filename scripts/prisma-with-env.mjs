import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";

loadEnv({ path: resolve(process.cwd(), ".env.local") });
loadEnv({ path: resolve(process.cwd(), ".env") });

const preferredDatabaseUrl =
  process.env.NEON2_POSTGRES_PRISMA_URL ||
  process.env.NEON2_DATABASE_URL ||
  process.env.NEON2_POSTGRES_URL ||
  process.env.NEON2_POSTGRES_URL_NON_POOLING ||
  process.env.NEON2_DATABASE_URL_UNPOOLED ||
  process.env.DATABASE_URL ||
  process.env.PRISMA_DATABASE_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  "";

process.env.DATABASE_URL = preferredDatabaseUrl;

if (!process.env.DATABASE_URL) {
  console.error(
    "DATABASE_URL is missing. Set DATABASE_URL (or PRISMA_DATABASE_URL / POSTGRES_PRISMA_URL / POSTGRES_URL).",
  );
  process.exit(1);
}

const prismaArgs = process.argv.slice(2);
if (!prismaArgs.length) {
  console.error("Usage: node scripts/prisma-with-env.mjs <prisma args>");
  process.exit(1);
}

const prismaCli = resolve(process.cwd(), "node_modules", "prisma", "build", "index.js");

const result = spawnSync(process.execPath, [prismaCli, ...prismaArgs], {
  cwd: process.cwd(),
  stdio: "inherit",
  env: process.env,
});

if (result.error) {
  console.error(result.error.message);
}

process.exit(result.status ?? 1);
