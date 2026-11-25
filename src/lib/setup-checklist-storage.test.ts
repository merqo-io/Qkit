// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  readSetupFlag,
  readTvOpened,
  resetSetupMemory,
  writeSetupFlag,
  writeTvOpened,
} from "./setup-checklist-storage";

beforeEach(() => {
  window.localStorage.clear();
  resetSetupMemory();
});

describe("setup checklist storage", () => {
  it("keys booth flags by booth", () => {
    writeSetupFlag("qr-viewed", "b1");
    expect(readSetupFlag("qr-viewed", "b1")).toBe(true);
    expect(readSetupFlag("qr-viewed", "b2")).toBe(false);
  });

  it("keeps the TV step per vendor, whichever booth the dialog showed", () => {
    expect(readTvOpened()).toBe(false);
    writeTvOpened();
    expect(readTvOpened()).toBe(true);
    expect(window.localStorage.getItem("qkit:setup:tv-opened")).toBe("1");
  });
});
