import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

const landingHtmlUrl = new URL("../public/landing.html", import.meta.url);
const landingCssUrl = new URL("../public/landing.css", import.meta.url);
const landingSourceUrl = new URL("../src/landing.ts", import.meta.url);
const landingSceneSourceUrl = new URL("../src/landingScene.ts", import.meta.url);
const landingAssetsSourceUrl = new URL("../src/landingAssets.ts", import.meta.url);

function relativeLuminance(hex) {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) =>
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
    );

  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(foreground, background) {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

test("public landing exposes only the canonical account and demo header actions", async () => {
  const html = await readFile(landingHtmlUrl, "utf8");
  const navigation = html.match(
    /<nav class="public-actions"[^>]*>([\s\S]*?)<\/nav>/,
  )?.[1];

  assert.ok(navigation, "expected the canonical public actions navigation");

  const actions = [...navigation.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>/g)]
    .map(([, href, label]) => ({ href, label: label.trim() }));

  assert.deepEqual(actions, [
    { href: "./signin.html", label: "Sign in" },
    { href: "./create-account.html", label: "Create account" },
    { href: "./index.html?start=new", label: "Trial Demo" },
  ]);
  assert.equal(
    [...html.matchAll(/href="\.\/(?:signin|create-account|index)\.html(?:\?start=new)?"/g)].length,
    3,
    "expected account and demo routes only in the sticky header",
  );
  assert.doesNotMatch(html, /(?:href|src)="[^"]*v2/i);
});

test("landing includes a non-blocking reduced-motion loading treatment", async () => {
  const [html, landingCss, source] = await Promise.all([
    readFile(landingHtmlUrl, "utf8"),
    readFile(landingCssUrl, "utf8"),
    readFile(landingSourceUrl, "utf8"),
  ]);

  assert.match(html, /data-landing-loader/);
  assert.match(html, /class="factory-story-canvas"/);
  assert.match(landingCss, /\.landing-loader\s*\{/);
  assert.match(landingCss, /body\.landing-ready \.landing-loader/);
  assert.match(landingCss, /\.landing-loader\s*\{[\s\S]*?pointer-events: none;/);
  assert.match(landingCss, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(
    landingCss,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*?body\[data-theme="landing"\] \.button-primary::after\s*\{[\s\S]*?display: none;/,
  );
  assert.match(landingCss, /\.site-header\s*\{[\s\S]*?position: sticky;/);
  assert.match(source, /DOMContentLoaded/);
  assert.match(source, /const loaderDwellMs = reducedMotion \? 0 : 520;/);
  assert.match(source, /if \(loaderDwellMs === 0\)\s*\{\s*revealLanding\(\);/);
  assert.match(source, /if \(reducedMotion \|\| !\("IntersectionObserver" in window\)\)/);
  assert.match(source, /classList\.add\("landing-ready"\)/);
  assert.doesNotMatch(source, /fetch\(|api\/demo\/reset/);
});

test("landing tells the canonical Find, Connect and Deploy story", async () => {
  const html = await readFile(landingHtmlUrl, "utf8");

  assert.match(html, /From line stop to committed specialist, in one workflow\./);
  assert.match(html, /01 \/ Find/);
  assert.match(html, /02 \/ Connect/);
  assert.match(html, /03 \/ Deploy/);
  assert.match(html, /Pinch-hosted checkout/);
  assert.match(html, /Payment is confirmed only by backend evidence/);
});

test("landing factory story is local, progressive and accessible", async () => {
  const [html, source, sceneSource, assetSource] = await Promise.all([
    readFile(landingHtmlUrl, "utf8"),
    readFile(landingSourceUrl, "utf8"),
    readFile(landingSceneSourceUrl, "utf8"),
    readFile(landingAssetsSourceUrl, "utf8"),
  ]);

  assert.match(html, /"three": "\.\/assets\/vendor\/three\/three\.module\.min\.js"/);
  assert.match(html, /"three\/addons\/": "\.\/assets\/vendor\/three\/addons\/"/);
  assert.match(html, /data-factory-story\s+data-story-state="static"/);
  assert.equal([...html.matchAll(/class="factory-story-panel/g)].length, 5);
  assert.doesNotMatch(html, /support\.js|DCLogic|cdn\.jsdelivr\.net|unpkg\.com/);

  assert.match(source, /const reducedMotion = window\.matchMedia/);
  assert.match(source, /supportsWebGL\(\)/);
  assert.match(source, /import\("\.\/landingScene\.js"\)/);
  assert.match(source, /factoryStory\.dataset\.storyState = "fallback"/);

  assert.match(sceneSource, /import \* as THREE from "three"/);
  assert.match(sceneSource, /new IntersectionObserver/);
  assert.match(sceneSource, /new ResizeObserver/);
  assert.match(sceneSource, /window\.devicePixelRatio/);
  assert.match(sceneSource, /visibilitychange/);
  assert.match(sceneSource, /forceContextLoss/);
  assert.match(sceneSource, /new THREE\.CatmullRomCurve3/);
  assert.match(sceneSource, /"centripetal"/);
  assert.doesNotMatch(sceneSource, /const cameraPosition = vectorAt/);
  assert.match(sceneSource, /\[gripperReleaseProgress, gripperReleasePosition\]/);
  assert.match(sceneSource, /THREE\.ACESFilmicToneMapping/);
  assert.match(sceneSource, /THREE\.SRGBColorSpace/);
  assert.match(sceneSource, /new SSAOPass/);
  assert.match(sceneSource, /new UnrealBloomPass/);
  assert.match(sceneSource, /new ShaderPass\(VignetteShader\)/);
  assert.match(sceneSource, /composer\.render\(0\)/);
  assert.match(sceneSource, /new GLTFLoader/);
  assert.match(sceneSource, /factoryAssetManifest\.robotArm/);
  assert.match(sceneSource, /factoryAssetManifest\.conveyor/);
  assert.match(sceneSource, /factoryAssetManifest\.machineWindow/);
  assert.match(sceneSource, /factoryAssetManifest\.shelf/);
  assert.match(sceneSource, /factoryAssetManifest\.pallet/);
  assert.match(sceneSource, /factoryAssetManifest\.deliveryVan/);
  assert.match(sceneSource, /factoryAssetManifest\.dockDoor/);
  assert.match(sceneSource, /factoryAssetManifest\.catwalkStairs/);
  assert.match(sceneSource, /factoryAssetManifest\.pipeLong/);

  const modelPaths = [...assetSource.matchAll(/"(\.\/assets\/models\/[^"]+\.glb)"/g)].map(
    ([, path]) => new URL(`../public/${path.slice(2)}`, import.meta.url),
  );
  assert.ok(modelPaths.length >= 12);
  const modelStats = await Promise.all(modelPaths.map((path) => stat(path)));
  assert.ok(modelStats.every((modelStat) => modelStat.size > 0));
  assert.ok(modelStats.reduce((total, modelStat) => total + modelStat.size, 0) < 8 * 1024 * 1024);
});

test("landing preserves visible focus, readable contrast and mobile fit", async () => {
  const landingCss = await readFile(landingCssUrl, "utf8");
  const readableRed = landingCss.match(/--signal-red-readable:\s*(#[\da-f]{6})/i)?.[1];

  assert.ok(readableRed, "expected a readable signal-red token");
  for (const background of ["#040a11", "#07111d", "#16283c", "#26141c"]) {
    assert.ok(contrastRatio(readableRed, background) >= 4.5);
  }
  assert.match(landingCss, /:where\(a, button\):focus-visible\s*\{/);
  assert.match(landingCss, /\.hero h1\s*\{[\s\S]*?line-height: 1\.08;/);
  assert.match(landingCss, /\.factory-story-stage\s*\{[\s\S]*?isolation: isolate;/);
  assert.match(landingCss, /\.factory-story-canvas\s*\{[\s\S]*?z-index: 0;/);
  assert.match(landingCss, /\.factory-story-overlay\s*\{[\s\S]*?z-index: 4;/);
  assert.match(
    landingCss,
    /@media \(max-width: 640px\)[\s\S]*?\.header-link\s*\{[\s\S]*?min-width: 44px;[\s\S]*?min-height: 44px;/,
  );
  assert.match(
    landingCss,
    /@media \(max-width: 640px\)[\s\S]*?\.header-demo\s*\{[\s\S]*?min-height: 44px;/,
  );
  assert.match(
    landingCss,
    /@media \(max-width: 390px\)[\s\S]*?\.header-demo\s*\{[\s\S]*?min-height: 44px;/,
  );
});
