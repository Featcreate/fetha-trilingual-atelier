export interface FileScanInput {
  fileUrl: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

export type FileScanVerdict = "clean" | "infected";

export async function scanUploadedFile(
  input: FileScanInput,
  env: Record<string, string | undefined> = process.env,
  fetcher: typeof fetch = fetch,
): Promise<FileScanVerdict> {
  const endpoint = env["FILE_SCAN_API_URL"]?.trim();
  const token = env["FILE_SCAN_API_TOKEN"];
  if (!endpoint || !token) throw new Error("file_scan_unavailable");

  let parsed: URL;
  try {
    parsed = new URL(endpoint);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.hash) {
      throw new Error("invalid_url");
    }
  } catch {
    throw new Error("file_scan_configuration_invalid");
  }

  let response: Response;
  try {
    response = await fetcher(parsed, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contract: "algorea-file-scan-v1",
        fileUrl: input.fileUrl,
        fileName: input.fileName,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
      }),
      signal: AbortSignal.timeout(90_000),
    });
  } catch {
    throw new Error("file_scan_service_unavailable");
  }

  if (!response.ok) throw new Error("file_scan_service_failed");

  let result: { status?: unknown };
  try {
    result = (await response.json()) as { status?: unknown };
  } catch {
    throw new Error("file_scan_invalid_result");
  }
  if (result.status !== "clean" && result.status !== "infected") {
    throw new Error("file_scan_invalid_result");
  }
  return result.status;
}
