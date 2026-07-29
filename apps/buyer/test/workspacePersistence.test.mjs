import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const mainBundle = await readFile(
  new URL("../public/assets/main.js", import.meta.url),
  "utf8"
);
const helperStart = mainBundle.indexOf(
  "function isCurrentWorkspaceRefresh"
);
const helperEnd = mainBundle.indexOf(
  "\nfunction loadDemo",
  helperStart
);
const restoreHelperStart = mainBundle.indexOf(
  "function resolveRestoredNeedProfileId"
);
const restoreHelperEnd = mainBundle.indexOf(
  "\nfunction setNeedProfileUrl",
  restoreHelperStart
);

assert.notEqual(helperStart, -1, "workspace refresh guard should exist");
assert.notEqual(helperEnd, -1, "workspace refresh guard should be bounded");
assert.notEqual(
  restoreHelperStart,
  -1,
  "workspace restore choice helper should exist"
);
assert.notEqual(
  restoreHelperEnd,
  -1,
  "workspace restore choice helper should be bounded"
);

const sandbox = {};
vm.runInNewContext(
  `${mainBundle.slice(helperStart, helperEnd)}
${mainBundle.slice(restoreHelperStart, restoreHelperEnd)}
this.isCurrentWorkspaceRefresh = isCurrentWorkspaceRefresh;`,
  sandbox
);
vm.runInNewContext(
  "this.resolveRestoredNeedProfileId = resolveRestoredNeedProfileId;",
  sandbox
);

test("discards an in-flight refresh after Start new requirement", () => {
  const priorWorkspace = { needProfile: { id: "need-complete" } };
  assert.equal(
    sandbox.isCurrentWorkspaceRefresh(
      priorWorkspace,
      4,
      undefined,
      5
    ),
    false
  );
});

test("applies only the refresh for the still-current workspace object", () => {
  const currentWorkspace = { needProfile: { id: "need-current" } };
  assert.equal(
    sandbox.isCurrentWorkspaceRefresh(
      currentWorkspace,
      7,
      currentWorkspace,
      7
    ),
    true
  );
  assert.equal(
    sandbox.isCurrentWorkspaceRefresh(
      { needProfile: { id: "need-current" } },
      7,
      currentWorkspace,
      7
    ),
    false
  );
});

test("a deliberate new requirement wins over another tab's last-need pointer", () => {
  assert.equal(
    sandbox.resolveRestoredNeedProfileId(
      undefined,
      "need-from-another-tab",
      true
    ),
    undefined
  );
  assert.equal(
    sandbox.resolveRestoredNeedProfileId(
      "need-from-explicit-link",
      "need-from-another-tab",
      true
    ),
    "need-from-explicit-link"
  );
  assert.equal(
    sandbox.resolveRestoredNeedProfileId(
      undefined,
      "need-from-last-session",
      false
    ),
    "need-from-last-session"
  );
});

test("Start new stores a tab-scoped reset marker", () => {
  assert.match(
    mainBundle,
    /safeSessionStorageSet\(NEW_REQUIREMENT_KEY, "1"\)/
  );
  assert.match(
    mainBundle,
    /safeSessionStorageRemove\(NEW_REQUIREMENT_KEY\)/
  );
});
