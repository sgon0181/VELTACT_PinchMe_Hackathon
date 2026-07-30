import { copyFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const threeEntry = require.resolve("three");
const threeModule = join(dirname(threeEntry), "three.module.min.js");
const destinationDirectory = join(packageRoot, "public", "assets", "vendor", "three");

await mkdir(destinationDirectory, { recursive: true });
await copyFile(threeModule, join(destinationDirectory, "three.module.min.js"));
