const BLOCKED_EXECUTABLE_EXTENSIONS = new Set([
  "386",
  "action",
  "apk",
  "app",
  "appimage",
  "appx",
  "bash",
  "bat",
  "bin",
  "cab",
  "cgi",
  "cmd",
  "com",
  "command",
  "cpl",
  "deb",
  "desktop",
  "dll",
  "dmg",
  "drv",
  "elf",
  "exe",
  "hta",
  "img",
  "iso",
  "jar",
  "jse",
  "lnk",
  "mjs",
  "msi",
  "msp",
  "mst",
  "msix",
  "ocx",
  "pif",
  "pkg",
  "pl",
  "ps1",
  "ps1xml",
  "ps2",
  "psc1",
  "psd1",
  "psm1",
  "py",
  "pyc",
  "rb",
  "reg",
  "rpm",
  "run",
  "scr",
  "service",
  "sh",
  "so",
  "sys",
  "vbe",
  "vbs",
  "wasm",
  "wsf",
  "wsh",
  "zsh",
]);

export function isBlockedExecutableFileName(fileName: string): boolean {
  const normalized = fileName.normalize("NFKC").replace(/\\/g, "/");
  const basename = normalized.split("/").pop()?.split(":")[0]?.replace(/[ .]+$/g, "") ?? "";
  const dot = basename.lastIndexOf(".");
  const extension = dot >= 0 ? basename.slice(dot + 1).toLowerCase() : "";
  return BLOCKED_EXECUTABLE_EXTENSIONS.has(extension);
}

export function assertSafeDigitalFileName(fileName: string): void {
  if (isBlockedExecutableFileName(fileName)) {
    throw new Error("executable_file_type_not_allowed");
  }
}
