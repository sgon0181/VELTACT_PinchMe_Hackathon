import { copyFile, mkdir, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  ".."
);
const compiledContractsDirectory = resolve(
  repositoryRoot,
  "packages/contracts/dist"
);
const browserContractsDirectory = resolve(
  repositoryRoot,
  "apps/buyer/public/assets/vendor/contracts"
);

await mkdir(browserContractsDirectory, { recursive: true });
const compiledFiles = await readdir(compiledContractsDirectory);
await Promise.all(
  compiledFiles
    .filter((fileName) => fileName.endsWith(".js"))
    .map((fileName) =>
      copyFile(
        resolve(compiledContractsDirectory, fileName),
        resolve(browserContractsDirectory, fileName)
      )
    )
);
