import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  clearSupplierResponseDraft,
  readSupplierResponseDraft,
  writeSupplierResponseDraft
} from "../public/supplierDraft.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
    removeItem(key) {
      values.delete(key);
    }
  };
}

describe("token-scoped supplier response drafts", () => {
  test("restores only the commercial fields for the matching invitation", () => {
    const storage = memoryStorage();
    const draft = {
      canHelp: "true",
      earliestAvailability: "2026-08-02",
      indicativePriceAud: "18500",
      relevantExperience: "Comparable ammonia systems",
      proposedApproach: "Inspect, isolate and repair",
      assumptions: "Site access is available",
      conditions: "Parts subject to inspection",
      declineReason: "",
      contactEmail: "must-not-persist@example.com"
    };

    assert.equal(writeSupplierResponseDraft(storage, "invitation-a", draft), true);
    assert.deepEqual(readSupplierResponseDraft(storage, "invitation-a"), {
      canHelp: "true",
      earliestAvailability: "2026-08-02",
      indicativePriceAud: "18500",
      relevantExperience: "Comparable ammonia systems",
      proposedApproach: "Inspect, isolate and repair",
      assumptions: "Site access is available",
      conditions: "Parts subject to inspection",
      declineReason: ""
    });
    assert.equal(readSupplierResponseDraft(storage, "invitation-b"), undefined);
  });

  test("clears a submitted draft and fails safely when storage is unavailable", () => {
    const storage = memoryStorage();
    writeSupplierResponseDraft(storage, "invitation-a", {
      canHelp: "false",
      declineReason: "No crew available"
    });

    assert.equal(clearSupplierResponseDraft(storage, "invitation-a"), true);
    assert.equal(readSupplierResponseDraft(storage, "invitation-a"), undefined);

    const unavailableStorage = {
      getItem() {
        throw new Error("blocked");
      },
      setItem() {
        throw new Error("blocked");
      },
      removeItem() {
        throw new Error("blocked");
      }
    };
    assert.equal(readSupplierResponseDraft(unavailableStorage, "token"), undefined);
    assert.equal(
      writeSupplierResponseDraft(unavailableStorage, "token", { canHelp: "true" }),
      false
    );
    assert.equal(clearSupplierResponseDraft(unavailableStorage, "token"), false);
  });
});
