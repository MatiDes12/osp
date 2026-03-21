import { resolve } from "node:path";
import { get } from "./config.js";

/**
 * Validates that a file path from the database is:
 * 1. An absolute path
 * 2. Confined within the allowed recordings directory
 * 3. Does not contain path traversal sequences
 *
 * Prevents a compromised/manipulated storage_path or clip_path value in the
 * database from being used to read arbitrary files off the server.
 */
export function assertSafePath(filePath: string): void {
  const recordingsDir = resolve(get("RECORDINGS_DIR") ?? "./recordings");

  // Resolve to absolute path (normalises ../ sequences)
  const resolved = resolve(filePath);

  // Must start with the recordings directory
  if (!resolved.startsWith(recordingsDir + "/") && resolved !== recordingsDir) {
    throw new Error(`Path traversal attempt blocked: ${filePath}`);
  }

  // Reject null bytes (used in some exploitation techniques)
  if (filePath.includes("\0")) {
    throw new Error(`Null byte in path blocked: ${filePath}`);
  }
}
