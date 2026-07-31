import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const landingHtmlUrl = new URL("../public/landing.html", import.meta.url);
const landingCssUrl = new URL("../public/landing.css", import.meta.url);
const landingSourceUrl = new URL("../src/landing.ts", import.meta.url);
const sceneSourceUrl = new URL("../src/landingScene.ts", import.meta.url);
const pinchLogoUrl = new URL("../public/assets/brand/pinch-logo.svg", import.meta.url);

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
    "expected account and demo routes only in the fixed header",
  );
  assert.doesNotMatch(html, /(?:href|src)="[^"]*v2/i);
});

test("landing animation remains separate from the real product workflow", async () => {
  const html = await readFile(landingHtmlUrl, "utf8");
  const chapters = [...html.matchAll(/data-story-panel="([^"]+)"/g)].map(
    ([, chapter]) => chapter,
  );
  const jumpTargets = [...html.matchAll(/data-story-jump="([^"]+)"/g)].map(
    ([, chapter]) => chapter,
  );

  assert.deepEqual(chapters, ["intro", "find", "connect", "deploy", "outcome"]);
  assert.deepEqual(jumpTargets, ["find", "connect", "deploy"]);
  assert.match(html, /Turn the problem into a plan\./);
  assert.match(html, /Make the right suppliers respond\./);
  assert.match(html, /Secure the supplier\. Start the work\./);
  assert.match(
    html,
    /Find the path\. Connect with the right supplier\. Deploy with control\./,
  );
  assert.match(html, /class="story-proof story-proof-find"/);
  assert.match(html, /class="story-proof story-proof-connect"/);
  assert.match(html, /class="story-proof story-proof-deploy"/);
  assert.match(html, /RapidMatch shortlist/);
  assert.match(html, /2 responses ready/);
  assert.match(html, /assets\/brand\/pinch-logo\.svg/);
  assert.match(html, /Verified payment evidence/);
  assert.doesNotMatch(html, /placeholder|image-slot|Drop the real/i);
  assert.match(html, /type="button"[\s\S]*?data-story-jump="find"/);
  assert.match(html, /type="button"[\s\S]*?data-story-jump="connect"/);
  assert.match(html, /type="button"[\s\S]*?data-story-jump="deploy"/);
  assert.doesNotMatch(html, /data-story-jump="[^"]+"[^>]+href=/);
});

test("landing uses a local Three runtime and does not depend on the design export runtime", async () => {
  const [html, pinchLogo] = await Promise.all([
    readFile(landingHtmlUrl, "utf8"),
    readFile(pinchLogoUrl, "utf8"),
  ]);

  assert.match(html, /"three": "\.\/assets\/vendor\/three\/three\.module\.min\.js"/);
  assert.match(html, /src="\.\/assets\/landing\.js"/);
  assert.doesNotMatch(html, /support\.js|text\/x-dc|DCLogic|cdn\.jsdelivr\.net/);
  assert.doesNotMatch(html, /unpkg\.com\/(?:react|@babel)/);
  assert.match(pinchLogo, /<svg[^>]+viewBox="0 0 161 40"/);
  assert.match(pinchLogo, /#FF5263/);
});

test("landing controller fails open without gating Trial Demo", async () => {
  const source = await readFile(landingSourceUrl, "utf8");

  assert.match(source, /prefers-reduced-motion: reduce/);
  assert.match(source, /supportsWebGL/);
  assert.match(source, /story\.dataset\.storyState = "fallback"/);
  assert.match(source, /import\("\.\/landingScene\.js"\)/);
  assert.match(source, /classList\.remove\("story-locked"\)/);
  assert.match(source, /classList\.add\("landing-ready"\)/);
  assert.doesNotMatch(source, /fetch\(|api\/|socket|payment/i);
});

test("scene keeps the protagonist right-weighted and chapters seekable", async () => {
  const source = await readFile(sceneSourceUrl, "utf8");

  assert.match(source, /const desiredX = isNarrow \? 0\.04 : 0\.34;/);
  assert.match(source, /const desiredY = isNarrow \? 0\.34 : 0;/);
  assert.match(source, /camera\.projectionMatrix\.elements\[8\] -= correctionX;/);
  assert.match(source, /camera\.projectionMatrix\.elements\[9\] -= correctionY;/);
  assert.match(source, /root\.dataset\.protagonistX/);
  assert.match(source, /root\.dataset\.protagonistY/);
  assert.match(source, /find: 0\.145/);
  assert.match(source, /connect: 0\.505/);
  assert.match(source, /deploy: 0\.765/);
  assert.match(source, /window\.scrollTo\(\{ behavior: "smooth", top \}\)/);
  assert.match(source, /button\.addEventListener\("click", handler\)/);
  assert.match(source, /button\.removeEventListener\("click", handler\)/);
  assert.match(source, /addSign\("FIND"[^;]+signPalette\);/);
  assert.match(source, /addSign\("CONNECT"[^;]+signPalette\);/);
  assert.match(source, /addSign\("DEPLOY"[^;]+signPalette\);/);
  assert.doesNotMatch(source, /BIN 01|FIT 02|DOCK 03/);
  assert.doesNotMatch(source, /signPalettes|faceStart: "#b7e5f5"/);
  assert.match(source, /const signWidth = 2\.45;/);
  assert.match(source, /const signHeight = 1\.3;/);
  assert.match(source, /new THREE\.PointLight\(palette\.light, 5\.5, 5\.2, 2\)/);
});

test("landing is progressive, responsive and keyboard accessible", async () => {
  const [html, css] = await Promise.all([
    readFile(landingHtmlUrl, "utf8"),
    readFile(landingCssUrl, "utf8"),
  ]);
  const signal = css.match(/--signal:\s*(#[\da-f]{6})/i)?.[1];

  assert.ok(signal, "expected a signal color token");
  assert.ok(contrastRatio(signal, "#070d16") >= 4.5);
  assert.match(html, /class="skip-link"/);
  assert.match(html, /aria-label="Animation chapters"/);
  assert.match(html, /aria-label="Go to Find animation"/);
  assert.match(css, /:where\(a, button\):focus-visible/);
  assert.match(css, /\.story\s*\{[\s\S]*?min-height: 700svh;/);
  assert.match(css, /\.story-stage\s*\{[\s\S]*?position: sticky;/);
  assert.match(css, /\.story-panel\s*\{[\s\S]*?left: 7vw;/);
  assert.match(css, /\.story-index\s*\{[\s\S]*?font-size: 0\.95rem;/);
  assert.match(css, /\.story-rail\s*\{[\s\S]*?width: 146px;[\s\S]*?height: 405px;/);
  assert.match(css, /\.story-rail-step strong\s*\{[\s\S]*?font-size: 0\.9rem;/);
  assert.match(css, /@media \(max-width: 680px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(
    css,
    /@media \(max-width: 680px\)[\s\S]*?\.header-link\s*\{[\s\S]*?min-height: 44px;/,
  );
  assert.match(
    css,
    /@media \(max-width: 680px\)[\s\S]*?\.header-demo\s*\{[\s\S]*?min-height: 44px;/,
  );
});
