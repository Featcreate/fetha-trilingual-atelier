import { describe, expect, it } from "vitest";
import { assertSafeDigitalFileName, isBlockedExecutableFileName } from "./file-type-safety";

describe("digital upload executable extension policy", () => {
  it.each([
    "setup.exe",
    "library.DLL",
    "installer.msi",
    "script.bat",
    "script.cmd",
    "payload.ps1",
    "archive.jar",
    "android.apk",
    "tool.AppImage",
    "run.sh",
    "shortcut.lnk",
    "payload.exe:stream",
    "folder\\nested\\payload.EXE",
    ".exe",
  ])("blocks %s", (name) => {
    expect(isBlockedExecutableFileName(name)).toBe(true);
    expect(() => assertSafeDigitalFileName(name)).toThrow("executable_file_type_not_allowed");
  });

  it.each([
    "planner.pdf",
    "audio.mp3",
    "video.mp4",
    "bundle.zip",
    "design.psd",
    "ebook.epub",
    "spreadsheet.xlsx",
    "source-code.txt",
  ])("allows supported non-executable extension %s", (name) => {
    expect(isBlockedExecutableFileName(name)).toBe(false);
    expect(() => assertSafeDigitalFileName(name)).not.toThrow();
  });
});
