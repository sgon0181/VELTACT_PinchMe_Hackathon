import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const landingHtmlUrl = new URL("../public/landing.html", import.meta.url);
const landingCssUrl = new URL("../public/landing.css", import.meta.url);
const alloyCssUrl = new URL("../public/alloy.css", import.meta.url);
const landingSourceUrl = new URL("../src/landing.ts", import.meta.url);

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
    { href: "./index.html", label: "Try demo" },
  ]);
  assert.doesNotMatch(html, /(?:href|src)="[^"]*v2/i);
});

test("landing includes a non-blocking reduced-motion loading treatment", async () => {
  const [html, landingCss, alloyCss, source] = await Promise.all([
    readFile(landingHtmlUrl, "utf8"),
    readFile(landingCssUrl, "utf8"),
    readFile(alloyCssUrl, "utf8"),
    readFile(landingSourceUrl, "utf8"),
  ]);

  assert.match(html, /data-landing-loader/);
  assert.match(html, /assets\/brand\/brushed-steel\.jpg|class="hero-material"/);
  assert.match(landingCss, /\.landing-loader\s*\{/);
  assert.match(landingCss, /body\.landing-ready \.landing-loader/);
  assert.match(landingCss, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(alloyCss, /body\[data-theme="landing"\] \.site-header \{ position: sticky; \}/);
  assert.match(source, /DOMContentLoaded/);
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
