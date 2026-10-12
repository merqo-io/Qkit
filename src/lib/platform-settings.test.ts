import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_PLATFORM_SETTINGS,
  PLATFORM_SETTINGS_TTL_MS,
  forgetPlatformSettings,
  platformSettings,
} from "./platform-settings";

const ON = { banner_enabled: true, banner_message: "Back at 3pm" };
const OFF = { banner_enabled: false, banner_message: "" };

beforeEach(() => forgetPlatformSettings());

describe("platformSettings", () => {
  it("reuses a read for requests inside the window", async () => {
    const read = vi.fn(async () => ON);
    expect(await platformSettings(read, 1_000)).toEqual(ON);
    expect(
      await platformSettings(read, 1_000 + PLATFORM_SETTINGS_TTL_MS - 1),
    ).toEqual(ON);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("reads again once the window has passed", async () => {
    const read = vi.fn().mockResolvedValueOnce(ON).mockResolvedValueOnce(OFF);
    await platformSettings(read, 1_000);
    expect(
      await platformSettings(read, 1_000 + PLATFORM_SETTINGS_TTL_MS),
    ).toEqual(OFF);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("falls back for one request when the row cannot be read, and tries again", async () => {
    const read = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(ON);
    expect(await platformSettings(read, 1_000)).toEqual(
      DEFAULT_PLATFORM_SETTINGS,
    );
    expect(await platformSettings(read, 1_001)).toEqual(ON);
  });

  it("reads again at once after being told to forget", async () => {
    const read = vi.fn().mockResolvedValueOnce(OFF).mockResolvedValueOnce(ON);
    await platformSettings(read, 1_000);
    forgetPlatformSettings();
    expect(await platformSettings(read, 1_001)).toEqual(ON);
  });
});
