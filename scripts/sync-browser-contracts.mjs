import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  ".."
);
const compiledContracts = resolve(
  repositoryRoot,
  "packages/contracts/dist/index.js"
);
const browserContracts = resolve(
  repositoryRoot,
  "apps/buyer/public/assets/vendor/contracts/index.js"
);

await mkdir(dirname(browserContracts), { recursive: true });
await copyFile(compiledContracts, browserContracts);
