import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";

function prepareVercelSqliteRuntime() {
  const rawUrl = (process.env.DATABASE_URL || "").trim();
  if (!rawUrl.startsWith("file:")) return;

  const filePath = rawUrl.slice("file:".length);
  if (!process.env.VERCEL) return;
  if (filePath.startsWith("/tmp/")) return;

  const relative = filePath.replace(/^\.?[\\/]/, "");
  const source = path.resolve(process.cwd(), relative);
  const target = "/tmp/final-destination.db";

  if (!fs.existsSync(source)) {
    return;
  }

  if (!fs.existsSync(target)) {
    fs.copyFileSync(source, target);
  }

  process.env.DATABASE_URL = `file:${target}`;
}

prepareVercelSqliteRuntime();

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient | undefined;
}

export const prisma =
  global.prismaGlobal ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  global.prismaGlobal = prisma;
}
