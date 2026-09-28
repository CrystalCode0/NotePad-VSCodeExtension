/**
 * File Utilities — Safe file system helpers with cross-platform path handling.
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * Characters not allowed in file/folder names.
 */
const INVALID_CHARS = /[<>:"/\\|?*\x00-\x1f]/g;

/**
 * Sanitize a file or folder name by removing invalid characters.
 */
export function sanitizeName(name: string): string {
  return name.replace(INVALID_CHARS, '').trim();
}

/**
 * Check if a name is valid for a file or folder.
 */
export function isValidName(name: string): boolean {
  const sanitized = sanitizeName(name);
  return sanitized.length > 0 && sanitized === name.trim();
}

/**
 * Ensure a directory exists, creating it recursively if needed.
 */
export async function ensureDir(dirPath: string): Promise<void> {
  try {
    await fs.promises.mkdir(dirPath, { recursive: true });
  } catch (err: any) {
    if (err.code !== 'EEXIST') {
      throw err;
    }
  }
}

/**
 * Check if a path exists on disk.
 */
export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a path is a directory.
 */
export async function isDirectory(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.promises.stat(filePath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Read a file's content as UTF-8 string.
 */
export async function readFileContent(filePath: string): Promise<string> {
  return fs.promises.readFile(filePath, 'utf-8');
}

/**
 * Write content to a file, creating parent directories if needed.
 */
export async function writeFileContent(filePath: string, content: string): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await fs.promises.writeFile(filePath, content, 'utf-8');
}

/**
 * Delete a file or directory recursively.
 */
export async function deleteRecursive(targetPath: string): Promise<void> {
  await fs.promises.rm(targetPath, { recursive: true, force: true });
}

/**
 * Get the relative path from a base directory. Uses forward slashes.
 */
export function getRelativePath(basePath: string, fullPath: string): string {
  return path.relative(basePath, fullPath).replace(/\\/g, '/');
}

/**
 * Generate a unique filename by appending a counter if the name already exists.
 * E.g., "note.md" → "note-1.md" → "note-2.md"
 */
export async function getUniqueName(dirPath: string, baseName: string, ext: string): Promise<string> {
  let name = `${baseName}.${ext}`;
  let counter = 1;

  while (await pathExists(path.join(dirPath, name))) {
    name = `${baseName}-${counter}.${ext}`;
    counter++;
  }

  return name;
}

/**
 * Get a simple hash of a string (for code snapshot change detection).
 */
export function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}
