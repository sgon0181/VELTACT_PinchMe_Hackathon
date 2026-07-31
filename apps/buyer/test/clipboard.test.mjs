import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { copyText } from "../public/assets/clipboard.js";

const previousNavigator = Object.getOwnPropertyDescriptor(
  globalThis,
  "navigator"
);
const previousDocument = Object.getOwnPropertyDescriptor(
  globalThis,
  "document"
);

afterEach(() => {
  restoreGlobal("navigator", previousNavigator);
  restoreGlobal("document", previousDocument);
});

test("falls back when clipboard permission rejects and reports the method", async () => {
  let selected = false;
  let removed = false;
  installGlobal("navigator", {
    clipboard: {
      async writeText() {
        throw new DOMException("Denied", "NotAllowedError");
      }
    }
  });
  installGlobal("document", {
    body: {
      append() {}
    },
    createElement() {
      return {
        value: "",
        readOnly: false,
        style: {},
        select() {
          selected = true;
        },
        setSelectionRange() {},
        remove() {
          removed = true;
        }
      };
    },
    execCommand(command) {
      assert.equal(command, "copy");
      return true;
    }
  });

  assert.equal(await copyText("https://supplier.example/token"), "legacy");
  assert.equal(selected, true);
  assert.equal(removed, true);
});

test("surfaces an actionable error when both copy mechanisms are blocked", async () => {
  let removed = false;
  installGlobal("navigator", {
    clipboard: {
      async writeText() {
        throw new Error("blocked");
      }
    }
  });
  installGlobal("document", {
    body: {
      append() {}
    },
    createElement() {
      return {
        value: "",
        readOnly: false,
        style: {},
        select() {},
        setSelectionRange() {},
        remove() {
          removed = true;
        }
      };
    },
    execCommand() {
      return false;
    }
  });

  await assert.rejects(
    copyText("https://supplier.example/token"),
    /Open the supplier link and copy its address/i
  );
  assert.equal(removed, true);
});

function installGlobal(name, value) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    value
  });
}

function restoreGlobal(name, descriptor) {
  if (descriptor) {
    Object.defineProperty(globalThis, name, descriptor);
  } else {
    delete globalThis[name];
  }
}
