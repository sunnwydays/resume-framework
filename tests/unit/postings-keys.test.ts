import { describe, expect, it } from "vitest";
import { keyAction, moveIndex } from "@/lib/tracker/postings/keys";

const base = { typing: false, modalOpen: false };

describe("keyAction", () => {
  it("maps the five keys plus movement", () => {
    expect(keyAction({ ...base, key: "j" })).toBe("next");
    expect(keyAction({ ...base, key: "k" })).toBe("prev");
    expect(keyAction({ ...base, key: "o" })).toBe("open");
    expect(keyAction({ ...base, key: "a" })).toBe("applied");
    expect(keyAction({ ...base, key: "d" })).toBe("dismiss");
    expect(keyAction({ ...base, key: "s" })).toBe("save");
  });

  it("ignores other keys and uppercase is the same key", () => {
    expect(keyAction({ ...base, key: "x" })).toBeNull();
    expect(keyAction({ ...base, key: "D" })).toBe("dismiss");
  });

  it("does nothing while typing or with a dialog open", () => {
    expect(keyAction({ ...base, key: "d", typing: true })).toBeNull();
    expect(keyAction({ ...base, key: "d", modalOpen: true })).toBeNull();
  });

  it("leaves browser shortcuts alone", () => {
    expect(keyAction({ ...base, key: "s", ctrlKey: true })).toBeNull();
    expect(keyAction({ ...base, key: "a", metaKey: true })).toBeNull();
    expect(keyAction({ ...base, key: "d", altKey: true })).toBeNull();
  });
});

describe("moveIndex", () => {
  it("starts at the first row going down and the last going up", () => {
    expect(moveIndex(null, 1, 5)).toBe(0);
    expect(moveIndex(null, -1, 5)).toBe(4);
  });

  it("clamps at both ends", () => {
    expect(moveIndex(4, 1, 5)).toBe(4);
    expect(moveIndex(0, -1, 5)).toBe(0);
    expect(moveIndex(2, 1, 5)).toBe(3);
    expect(moveIndex(2, -1, 5)).toBe(1);
  });

  it("has no row in an empty list", () => {
    expect(moveIndex(null, 1, 0)).toBeNull();
    expect(moveIndex(3, 1, 0)).toBeNull();
  });
});
