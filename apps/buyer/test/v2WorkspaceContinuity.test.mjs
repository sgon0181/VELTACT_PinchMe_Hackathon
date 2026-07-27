import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  changeRequestDraftForProject,
  requireSuccessfulWorkspaceRefresh,
  restoredPhaseForWorkspace,
  safeStorageGet,
  safeStorageRemove,
  safeStorageSet,
  updateChangeRequestDraft
} from "../public/assets/v2WorkspaceState.js";

function workspaceState(overrides = {}) {
  return {
    solutionDecision: undefined,
    supplierLeads: [],
    supplierInvitations: [],
    outreachDeliveries: [],
    supplierProfiles: [],
    supplierResponses: [],
    projects: [],
    ...overrides
  };
}

describe("V2 buyer workspace continuity", () => {
  test("keeps a dirty change request through repeated workspace refreshes", () => {
    let draft = changeRequestDraftForProject(
      undefined,
      "project-1",
      "Alex Morgan"
    );
    draft = updateChangeRequestDraft(draft, "title", "Move commissioning");
    draft = updateChangeRequestDraft(
      draft,
      "requestedBy",
      "Taylor Nguyen"
    );
    draft = updateChangeRequestDraft(
      draft,
      "description",
      "Move the commissioning window to night shift."
    );
    draft = updateChangeRequestDraft(
      draft,
      "impact",
      "Two-day schedule movement; no cost change."
    );

    const afterPolling = changeRequestDraftForProject(
      draft,
      "project-1",
      "Alex Morgan"
    );
    const afterFocusLoss = changeRequestDraftForProject(
      afterPolling,
      "project-1",
      "Alex Morgan"
    );
    const afterSocketRefresh = changeRequestDraftForProject(
      afterFocusLoss,
      "project-1",
      "Alex Morgan"
    );

    assert.deepEqual(afterSocketRefresh, {
      projectId: "project-1",
      title: "Move commissioning",
      requestedBy: "Taylor Nguyen",
      description: "Move the commissioning window to night shift.",
      impact: "Two-day schedule movement; no cost change.",
      dirty: true
    });
  });

  test("starts a clean draft when the delivery project changes", () => {
    const prior = updateChangeRequestDraft(
      changeRequestDraftForProject(undefined, "project-1", "Alex Morgan"),
      "title",
      "Prior change"
    );

    assert.deepEqual(
      changeRequestDraftForProject(prior, "project-2", "Sam Lee"),
      {
        projectId: "project-2",
        title: "",
        requestedBy: "Sam Lee",
        description: "",
        impact: "",
        dirty: false
      }
    );
  });

  test("treats a failed required refresh as an error instead of success", async () => {
    await assert.rejects(
      requireSuccessfulWorkspaceRefresh(async () => false),
      /may have been saved.*could not be refreshed/
    );
    await assert.doesNotReject(
      requireSuccessfulWorkspaceRefresh(async () => true)
    );
  });

  test("contains unavailable and throwing local storage", () => {
    const unavailable = () => {
      throw new Error("storage blocked");
    };
    const throwingStorage = () => ({
      getItem() {
        throw new Error("get blocked");
      },
      setItem() {
        throw new Error("set blocked");
      },
      removeItem() {
        throw new Error("remove blocked");
      }
    });

    assert.equal(safeStorageGet(unavailable, "token"), null);
    assert.equal(safeStorageGet(throwingStorage, "token"), null);
    assert.equal(safeStorageSet(throwingStorage, "token", "secret"), false);
    assert.equal(
      safeStorageSet(
        () => ({
          getItem: () => null,
          setItem: () => undefined,
          removeItem: () => undefined
        }),
        "token",
        "secret"
      ),
      true
    );
    assert.doesNotThrow(() =>
      safeStorageRemove(throwingStorage, "token")
    );
  });

  test("keeps pre-discovery decisions in Find, restores Connect for supplier state, and lets Deploy win", () => {
    assert.equal(restoredPhaseForWorkspace(workspaceState()), "find");
    assert.equal(
      restoredPhaseForWorkspace(
        workspaceState({ solutionDecision: { decision: "hybrid" } })
      ),
      "find"
    );
    assert.equal(
      restoredPhaseForWorkspace(
        workspaceState({ supplierLeads: [{ id: "lead-1" }] })
      ),
      "connect"
    );
    assert.equal(
      restoredPhaseForWorkspace(
        workspaceState({ outreachDeliveries: [{ id: "delivery-1" }] })
      ),
      "connect"
    );
    assert.equal(
      restoredPhaseForWorkspace(
        workspaceState({ supplierResponses: [{ id: "response-1" }] })
      ),
      "connect"
    );
    assert.equal(
      restoredPhaseForWorkspace(
        workspaceState({
          solutionDecision: { decision: "hybrid" },
          supplierResponses: [{ id: "response-1" }],
          projects: [{ id: "project-1" }]
        })
      ),
      "deploy"
    );
  });
});
