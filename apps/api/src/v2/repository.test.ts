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
