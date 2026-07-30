import { copyFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const threeEntry = require.resolve("three");
const threePackageRoot = dirname(dirname(threeEntry));
const threeModule = join(dirname(threeEntry), "three.module.min.js");
const destinationDirectory = join(packageRoot, "public", "assets", "vendor", "three");
const addonFiles = [
  "loaders/GLTFLoader.js",
  "math/SimplexNoise.js",
  "postprocessing/EffectComposer.js",
  "postprocessing/MaskPass.js",
  "postprocessing/OutputPass.js",
  "postprocessing/Pass.js",
  "postprocessing/RenderPass.js",
  "postprocessing/ShaderPass.js",
  "postprocessing/SSAOPass.js",
  "postprocessing/UnrealBloomPass.js",
  "shaders/CopyShader.js",
  "shaders/LuminosityHighPassShader.js",
  "shaders/OutputShader.js",
  "shaders/SSAOShader.js",
  "shaders/VignetteShader.js",
  "utils/BufferGeometryUtils.js",
];

await mkdir(destinationDirectory, { recursive: true });
await copyFile(threeModule, join(destinationDirectory, "three.module.min.js"));

for (const relativePath of addonFiles) {
  const source = join(threePackageRoot, "examples", "jsm", relativePath);
  const destination = join(destinationDirectory, "addons", relativePath);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(source, destination);
}
