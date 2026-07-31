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

test("the public Trial Demo entry starts fresh and removes its routing hint", () => {
  assert.match(
    mainBundle,
    /const freshEntryRequested = url\.searchParams\.get\("start"\) === "new"/
  );
  assert.match(
    mainBundle,
    /if \(freshEntryRequested\) \{\s*safeStorageRemove\(LAST_NEED_KEY\);\s*safeSessionStorageSet\(NEW_REQUIREMENT_KEY, "1"\);/
  );
  assert.match(
    mainBundle,
    /freshEntryRequested \|\|\s*safeSessionStorageGet\(NEW_REQUIREMENT_KEY\) === "1"/
  );
  assert.match(mainBundle, /"needProfileId",\s*"start"/);
});

test("a missing workspace restored from browser storage recovers to fresh intake", () => {
  assert.match(
    mainBundle,
    /identity\.restoredFromStorage\s*&&\s*isMissingNeedProfileError\(error\)/
  );
  assert.match(
    mainBundle,
    /resetRequirementState\(identity\.needProfileId\)/
  );
  assert.match(
    mainBundle,
    /restoredFromStorage:\s*!explicitNeedProfileId\s*&&\s*Boolean\(needProfileId\)/
  );
});

test("persists the reviewed pre-Need draft in tab-scoped storage", () => {
  assert.match(
    mainBundle,
    /if \(!identity\.needProfileId\) \{\s*restorePreNeedIntakeDraft\(\)/
  );
  assert.match(
    mainBundle,
    /safeSessionStorageSet\(\s*PRE_NEED_INTAKE_DRAFT_KEY,\s*serializePreNeedIntakeDraft/
  );
  assert.match(
    mainBundle,
    /syncIntakeDraft\(requirementForm\);\s*intakeRevision \+= 1;\s*persistPreNeedIntakeDraft\(\)/
  );
  assert.match(
    mainBundle,
    /safeSessionStorageRemove\(PRE_NEED_INTAKE_DRAFT_KEY\)/
  );
  assert.match(
    mainBundle,
    /File details restored; reattach before rerunning analysis/
  );
});
