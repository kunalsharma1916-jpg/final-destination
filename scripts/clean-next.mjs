import { rmSync } from "node:fs";
import { resolve } from "node:path";

const targets = [resolve(process.cwd(), ".next"), resolve(process.cwd(), ".turbo")];

try {
  for (const target of targets) {
    rmSync(target, { recursive: true, force: true });
  }
  console.log("Cleared build caches (.next, .turbo)");
} catch (error) {
  console.error("Failed to clear build caches:", error);
  process.exitCode = 1;
}
