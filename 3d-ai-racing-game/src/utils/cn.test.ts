import { describe, expect, it } from "vitest";
import { cn } from "./cn";

describe("cn", () => {
  it("joins truthy parts with single spaces", () => {
    expect(cn("a", "b", "c")).toBe("a b c");
  });

  it("drops falsy values", () => {
    expect(cn("a", false, null, undefined, "", "b")).toBe("a b");
  });

  it("supports conditional expressions", () => {
    const active = false;
    expect(cn("seg", active && "active")).toBe("seg");
    expect(cn("seg", !active && "active")).toBe("seg active");
  });

  it("trims and keeps zero", () => {
    expect(cn("  a  ", 0)).toBe("a 0");
  });

  it("returns an empty string for nothing", () => {
    expect(cn()).toBe("");
  });
});
