import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, test } from "node:test";
import {
  AtomicV2Repository,
  V2RepositoryError,
  createEmptyV2Snapshot
} from "./repository.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("AtomicV2Repository", () => {
  test("serialises concurrent mutations without losing updates", async () => {
    const filePath = temporaryFile("state.json");
    const repository = new AtomicV2Repository(filePath);

    await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        repository.mutate((draft) => {
          draft.lastResetAt = new Date(
            Date.UTC(2026, 6, 26, 0, 0, index)
          ).toISOString();
        })
      )
    );
    await repository.flush();

    const persisted = JSON.parse(readFileSync(filePath, "utf8")) as {
      revision: number;
    };
    assert.equal(persisted.revision, 8);
    assert.equal(repository.snapshot().revision, 8);
  });

  test("replaces state through an explicit deterministic reset", async () => {
    const repository = new AtomicV2Repository(temporaryFile("state.json"));
    const resetState = createEmptyV2Snapshot(
      new Date("2026-07-26T00:00:00.000Z")
    );
    resetState.lastResetAt = "2026-07-26T00:00:00.000Z";

    const first = await repository.reset(resetState);
    const second = await repository.reset(resetState);

    assert.equal(first.lastResetAt, second.lastResetAt);
    assert.equal(second.revision, 2);
  });

  test("normalises legacy local-demo evidence to non-authoritative", async () => {
    const filePath = temporaryFile("state.json");
    const snapshot = createEmptyV2Snapshot(
      new Date("2026-07-26T00:00:00.000Z")
    );
    const legacySnapshot = {
      ...snapshot,
      paymentEvidence: [
        {
          id: "demo-evidence-1",
          projectId: "project-1",
          milestoneId: "milestone-1",
          provider: "local_demo",
          eventId: "local-demo:project-1:milestone-1",
          eventType: "local-demo-payment",
          paymentStatus: "paid",
          authoritative: true,
          receivedAt: "2026-07-26T00:00:00.000Z",
          metadata: { sourceMode: "fixture" }
        }
      ]
    };
    writeFileSync(filePath, JSON.stringify(legacySnapshot), "utf8");

    const repository = new AtomicV2Repository(filePath);
    assert.equal(repository.snapshot().paymentEvidence[0]?.authoritative, false);
    await repository.mutate((draft) => {
      draft.lastResetAt = "2026-07-26T00:00:00.000Z";
    });
    const persisted = JSON.parse(readFileSync(filePath, "utf8")) as {
      paymentEvidence: Array<{ authoritative: boolean }>;
    };
    assert.equal(persisted.paymentEvidence[0]?.authoritative, false);
  });

  test("fails fast when persisted data is corrupt or incompatible", () => {
    const filePath = temporaryFile("state.json");
    writeFileSync(filePath, JSON.stringify({ schemaVersion: 99 }), "utf8");

    assert.throws(
      () => new AtomicV2Repository(filePath),
      (error: unknown) =>
        error instanceof V2RepositoryError &&
        error.message.includes("corrupt or incompatible")
    );
  });
});

function temporaryFile(fileName: string) {
  const directory = mkdtempSync(path.join(os.tmpdir(), "veltact-v2-"));
  temporaryDirectories.push(directory);
  return path.join(directory, fileName);
}
