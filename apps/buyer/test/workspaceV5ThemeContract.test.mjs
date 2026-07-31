import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";

const pageNames = [
  "index.html",
  "supplier.html",
  "supplier-claim.html",
  "v2.html",
  "signin.html",
  "create-account.html"
];

const pages = new Map(
  await Promise.all(
    pageNames.map(async (pageName) => [
      pageName,
      await readFile(new URL(`../public/${pageName}`, import.meta.url), "utf8")
    ])
  )
);

const [
  themeStyles,
  buyerStyles,
  supplierStyles,
  supplierClaimStyles,
  v2Styles,
  accountStyles,
  themeSource,
  buyerSource,
  supplierClaimSource,
  v2Source,
  buyerRuntime,
  supplierClaimRuntime,
  v2Runtime
] = await Promise.all([
  readFile(new URL("../public/workspace-v5.css", import.meta.url), "utf8"),
  readFile(new URL("../public/styles.css", import.meta.url), "utf8"),
  readFile(new URL("../public/supplier.css", import.meta.url), "utf8"),
  readFile(new URL("../public/supplier-claim.css", import.meta.url), "utf8"),
  readFile(new URL("../public/v2.css", import.meta.url), "utf8"),
  readFile(new URL("../public/account.css", import.meta.url), "utf8"),
  readFile(new URL("../src/workspaceTheme.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/main.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/supplierClaim.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/v2.ts", import.meta.url), "utf8"),
  readFile(new URL("../public/assets/main.js", import.meta.url), "utf8"),
  readFile(new URL("../public/assets/supplierClaim.js", import.meta.url), "utf8"),
  readFile(new URL("../public/assets/v2.js", import.meta.url), "utf8")
]);
const themeRuntime = await import(
  new URL("../public/assets/workspaceTheme.js", import.meta.url)
);

describe("Workspace V5 shared theme", () => {
  test("uses the authoritative light and dark tokens and typography", () => {
    assert.match(
      themeStyles,
      /--v5-font-body:\s*"Instrument Sans"[\s\S]*?--v5-font-brand:\s*"Chakra Petch"[\s\S]*?--v5-font-mono:\s*"Geist Mono"/
    );
    assert.match(
      themeStyles,
      /html\[data-workspace-theme="light"\][\s\S]*?--v5-canvas:\s*#e9f0f7;[\s\S]*?--v5-surface:\s*#f7fafd;[\s\S]*?--v5-text:\s*#12263c;[\s\S]*?--v5-red:\s*#c22f3a;[\s\S]*?--v5-blue:\s*#1d5a8a;/
    );
    assert.match(
      themeStyles,
      /html\[data-workspace-theme="dark"\][\s\S]*?--v5-canvas:\s*#02070f;[\s\S]*?--v5-surface:\s*#071120;[\s\S]*?--v5-text:\s*#e8f0f9;[\s\S]*?--v5-red:\s*#d8383f;[\s\S]*?--v5-blue:\s*#9cc4e8;/
    );
    assert.match(themeStyles, /--v5-header-height:\s*62px;/);
    assert.match(
      themeStyles,
      /html\[data-workspace-theme\] body\s*\{[\s\S]*?overflow-x:\s*clip;/
    );
    assert.match(themeStyles, /linear-gradient\(\s*100deg,/);
    assert.match(themeStyles, /backdrop-filter:\s*blur\(18px\) saturate\(1\.25\)/);
    assert.match(
      themeStyles,
      /--v5-faint-readable:\s*#405d77;[\s\S]*?--v5-red-text:\s*#c22f3a;/
    );
    assert.match(
      themeStyles,
      /--v5-faint-readable:\s*#9db2c8;[\s\S]*?--v5-red-text:\s*#ef666d;/
    );
    assert.match(themeStyles, /--v5-success-text:\s*#256b42;/);
    assert.match(themeStyles, /--v5-disabled-text:\s*#405d77;/);
    assert.match(themeStyles, /--v5-danger-text:\s*#b5232e;/);
    assert.match(themeStyles, /--v5-success-text:\s*#79c99a;/);
    assert.match(themeStyles, /--v5-disabled-text:\s*#9db2c8;/);
    assert.match(themeStyles, /--v5-danger-text:\s*#ef666d;/);
    assert.match(themeStyles, /--v5-step-current-bg:\s*#0e2138;/);
    assert.match(themeStyles, /--v5-step-current-bg:\s*#e6eef7;/);
    assert.match(
      themeStyles,
      /--v5-priority-selected-text:\s*#f2f7fc;/
    );
    assert.match(
      themeStyles,
      /--v5-priority-selected-text:\s*#0e1f33;/
    );
    assert.match(themeStyles, /outline:\s*2px solid var\(--v5-red\);/);
    assert.doesNotMatch(themeStyles, /outline:\s*1px solid/);
    assert.match(
      themeStyles,
      /:where\(html\[data-workspace-theme\]\) :where\(a\)\s*\{/
    );
    assert.doesNotMatch(
      themeStyles,
      /^html\[data-workspace-theme\] :where\(a\)\s*\{/m
    );
  });

  test("wires every product page before its page-specific stylesheet", () => {
    for (const [pageName, page] of pages) {
      const pageStylesheet =
        pageName === "index.html"
          ? "styles.css"
          : pageName === "supplier.html"
            ? "supplier.css"
            : pageName === "supplier-claim.html"
              ? "supplier-claim.css"
              : pageName === "v2.html"
                ? "v2.css"
                : "account.css";
      assert.match(page, /<html lang="en" data-workspace-theme="light">/);
      assert.match(
        page,
        /family=Instrument\+Sans:wght@400;500;600;700&family=Chakra\+Petch:wght@500;600;700&family=Geist\+Mono:wght@400;500/
      );
      assert.match(page, /href="\.\/workspace-v5\.css\?v=workspace-v5-1"/);
      assert.match(
        page,
        new RegExp(
          `href="\\./${pageStylesheet.replace(".", "\\.")}\\?v=workspace-v5-1"`
        )
      );
      assert.match(
        page,
        /type="module" src="\.\/assets\/workspaceTheme\.js\?v=workspace-v5-1"/
      );
      assert.ok(
        page.indexOf("workspace-v5.css") < page.indexOf(pageStylesheet),
        `${pageName} must load the shared theme before its page stylesheet`
      );
      assert.ok(
        page.indexOf("veltact:workspace-theme:v1") <
          page.indexOf("workspace-v5.css"),
        `${pageName} must synchronously apply the persisted theme before CSS`
      );
    }
  });

  test("keeps existing page roots and body contracts intact", () => {
    assert.match(pages.get("index.html"), /<body data-theme="buyer">/);
    assert.match(pages.get("index.html"), /<main id="app"/);
    assert.match(pages.get("supplier.html"), /<body data-theme="supplier">/);
    assert.match(
      pages.get("supplier.html"),
      /<main id="supplier-content" class="supplier-shell">/
    );
    assert.match(pages.get("supplier-claim.html"), /<body>/);
    assert.match(pages.get("supplier-claim.html"), /<main id="claim-app"/);
    assert.match(pages.get("v2.html"), /<body>/);
    assert.match(pages.get("v2.html"), /<main id="v2-app"/);
    assert.match(
      pages.get("signin.html"),
      /<body class="account-page" data-account-page="signin">/
    );
    assert.match(
      pages.get("create-account.html"),
      /<body class="account-page" data-account-page="create">/
    );
    assert.doesNotMatch(pages.get("index.html"), /alloy\.css/);
    assert.doesNotMatch(pages.get("supplier.html"), /alloy\.css/);
  });

  test("keeps decorative brand ornaments out and uses canon diamond selection marks", () => {
    const decorativeOrnament =
      /product-wordmark-notch|brand-notch|wordmark-mark|success-mark/;
    const productSurfaces = new Map([
      ["buyer source", buyerSource],
      ["buyer runtime", buyerRuntime],
      ["buyer styles", buyerStyles],
      ["supplier page", pages.get("supplier.html")],
      ["supplier styles", supplierStyles],
      ["supplier claim source", supplierClaimSource],
      ["supplier claim runtime", supplierClaimRuntime],
      ["supplier claim styles", supplierClaimStyles],
      ["V2 source", v2Source],
      ["V2 runtime", v2Runtime],
      ["V2 styles", v2Styles],
      ["account styles", accountStyles],
      ["sign-in page", pages.get("signin.html")],
      ["create-account page", pages.get("create-account.html")]
    ]);

    for (const [surface, content] of productSurfaces) {
      assert.doesNotMatch(
        content,
        decorativeOrnament,
        `${surface} must not reintroduce decorative brand or title diamonds`
      );
    }

    // The authoritative v5 files render every selectable card with a rotated
    // square "diamond" mark (checkBg/checkBd in the canon), painted on the
    // native inputs so semantics and keyboard behaviour are unchanged.
    assert.match(
      themeStyles,
      /--v5-diamond-border-off:[\s\S]*?--v5-diamond-border-on:[\s\S]*?--v5-diamond-fill-on:/,
      "theme must define the canon diamond selection tokens"
    );
    assert.match(
      buyerStyles,
      /\.solution-choice > input[\s\S]{0,700}?transform:\s*rotate\(45deg\)/,
      "pathway selection must use the canon diamond mark"
    );
    assert.match(
      buyerStyles,
      /\.response-select input:checked[\s\S]{0,200}?var\(--v5-diamond-fill-on/,
      "checked responses must fill with the canon diamond gradient"
    );
    assert.match(
      buyerStyles,
      /body\[data-theme="buyer"\] \.priority-radio\s*\{[^}]*transform:\s*rotate\(45deg\)/,
      "priority buttons must use the canon diamond indicator"
    );
    assert.match(
      buyerStyles,
      /\.solution-choice > input:focus-visible[\s\S]{0,200}?outline/,
      "diamond inputs must keep a visible keyboard focus ring"
    );
    // Native inputs stay in the markup for semantics; only their paint is
    // replaced by the diamond recipe above.
    assert.match(buyerSource, /class="priority-radio"/);
    assert.match(
      buyerSource,
      /type="radio"\s+name="solution-pathway"/
    );
    assert.match(
      buyerSource,
      /type="radio"\s+name="supplier-response"/
    );
    assert.match(
      buyerSource,
      /type="checkbox"\s+value="[^"]*"\s+data-candidate-id=/
    );
    assert.match(
      buyerSource,
      /type="checkbox"\s+name="outreach-choice"/
    );
  });

  test("validates persistence and exposes a tiny accessible theme control", () => {
    assert.match(
      themeSource,
      /WORKSPACE_THEME_STORAGE_KEY = "veltact:workspace-theme:v1"/
    );
    assert.match(
      themeSource,
      /value === "light" \|\| value === "dark"/
    );
    assert.match(themeSource, /catch \{\s*return DEFAULT_WORKSPACE_THEME;/);
    assert.match(themeSource, /document\.body\.append\(button\)/);
    assert.match(themeSource, /window\.addEventListener\("storage"/);
    assert.match(themeSource, /window\.matchMedia\("\(pointer: fine\)"\)/);
    assert.match(
      themeSource,
      /window\.matchMedia\(\s*"\(prefers-reduced-motion: reduce\)"/
    );
    assert.match(themeSource, /document\.addEventListener\(\s*"pointermove"/);
    assert.match(
      themeSource,
      /event\.target\.closest<HTMLElement>\(WORKSPACE_GLOW_SURFACE_SELECTOR\)/
    );
    assert.match(themeSource, /style\.setProperty\("--mx"/);
    assert.match(themeSource, /style\.setProperty\("--my"/);
    assert.match(themeSource, /button\.setAttribute\("aria-label"/);
    assert.match(themeSource, /button\.setAttribute\("aria-pressed"/);
    assert.match(themeStyles, /\.workspace-theme-toggle\s*\{[\s\S]*?height:\s*44px;/);
    assert.match(themeStyles, /@media \(pointer:\s*coarse\)/);
    assert.match(themeStyles, /@media \(prefers-reduced-motion:\s*reduce\)/);
    assert.match(
      themeStyles,
      /@media print\s*\{[\s\S]*?\.workspace-theme-toggle\s*\{[\s\S]*?display:\s*none !important;/
    );
    assert.match(
      buyerStyles,
      /\.product-phase-nav[\s\S]*?min-height:\s*44px;[\s\S]*?\.product-phase-nav \.is-current/
    );
    assert.match(
      v2Styles,
      /\.topbar \.button\.tertiary[\s\S]*?color:\s*#f2f7fc;/
    );
  });

  test("falls back safely when stored theme data is absent, invalid or unavailable", () => {
    assert.equal(
      themeRuntime.readStoredWorkspaceTheme({
        getItem: () => "dark",
        setItem: () => {}
      }),
      "dark"
    );
    assert.equal(
      themeRuntime.readStoredWorkspaceTheme({
        getItem: () => "sepia",
        setItem: () => {}
      }),
      "light"
    );
    assert.equal(
      themeRuntime.readStoredWorkspaceTheme({
        getItem: () => {
          throw new Error("storage blocked");
        },
        setItem: () => {}
      }),
      "light"
    );
    assert.equal(
      themeRuntime.storeWorkspaceTheme("dark", {
        getItem: () => null,
        setItem: () => {
          throw new Error("storage full");
        }
      }),
      false
    );

    const root = { dataset: {}, style: {} };
    assert.equal(themeRuntime.applyWorkspaceTheme("dark", root), "dark");
    assert.equal(root.dataset.workspaceTheme, "dark");
    assert.equal(root.style.colorScheme, "dark");
    assert.equal(themeRuntime.applyWorkspaceTheme("invalid", root), "light");
    assert.equal(root.dataset.workspaceTheme, "light");
  });
});
