// Uploaded files, kept on local disk in UPLOAD_DIR. Each file is stored under
// a random key, never under a name that came from the user, so an upload can't
// overwrite another file or reach outside the folder.
import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { env } from "./env";

const STORAGE_KEY =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function folder(): string {
  return resolve(env().UPLOAD_DIR);
}

function pathOf(key: string): string {
  if (!STORAGE_KEY.test(key)) throw new Error(`Not a storage key: "${key}"`);
  return join(folder(), key);
}

/** Stores a file under a new random key, and returns the key. */
export async function storeFile(bytes: Uint8Array): Promise<string> {
  const key = randomUUID();
  await mkdir(folder(), { recursive: true });
  // "wx" fails rather than overwrite, should a key ever repeat.
  await writeFile(pathOf(key), bytes, { flag: "wx" });
  return key;
}

/**
 * Reads a stored file.
 *
 * @returns The file's bytes, or null if it no longer exists.
 */
export async function readStoredFile(key: string): Promise<Buffer | null> {
  try {
    return await readFile(pathOf(key));
  } catch (error) {
    if (isMissingFile(error)) return null;
    throw error;
  }
}

/** Deletes a stored file. A file that is already gone is not an error. */
export async function deleteStoredFile(key: string): Promise<void> {
  await rm(pathOf(key), { force: true });
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
