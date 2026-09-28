/**
 * StorageService — All file system operations on the .notes/ directory.
 * Handles folder/note CRUD, tree building, and file reading/writing.
 */

import * as path from 'path';
import * as fs from 'fs';
import { TreeNode, NoteFrontmatter } from '../models/types';
import { FS_CONSTANTS } from '../models/constants';
import {
  ensureDir,
  pathExists,
  isDirectory,
  readFileContent,
  writeFileContent,
  deleteRecursive,
  sanitizeName,
  isValidName,
  getUniqueName,
} from '../utils/fileUtils';
import { toISOString } from '../utils/dateUtils';

export class StorageService {
  private notesDir: string;

  constructor(private workspacePath: string) {
    this.notesDir = path.join(workspacePath, FS_CONSTANTS.NOTES_DIR);
  }

  /**
   * Get the absolute path to the .notes/ directory.
   */
  getNotesDir(): string {
    return this.notesDir;
  }

  /**
   * Ensure the .notes/ directory exists.
   */
  async ensureNotesDir(): Promise<void> {
    await ensureDir(this.notesDir);
  }

  // ─── Tree Building ────────────────────────────────────────

  /**
   * Build the complete tree of folders and notes from the .notes/ directory.
   */
  async getTree(): Promise<TreeNode[]> {
    await this.ensureNotesDir();
    return this.buildTree(this.notesDir, '');
  }

  private async buildTree(dirPath: string, relativePath: string): Promise<TreeNode[]> {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    const nodes: TreeNode[] = [];

    for (const entry of entries) {
      // Skip hidden files/folders (like .notesconfig.json, .templates)
      if (entry.name.startsWith('.')) {
        continue;
      }

      const fullPath = path.join(dirPath, entry.name);
      const nodeRelPath = relativePath ? `${relativePath}/${entry.name}` : `/${entry.name}`;

      if (entry.isDirectory()) {
        const children = await this.buildTree(fullPath, nodeRelPath);
        nodes.push({
          name: entry.name,
          path: nodeRelPath,
          type: 'folder',
          children,
          expanded: false,
        });
      } else if (entry.name.endsWith('.md') || entry.name.endsWith('.txt')) {
        nodes.push({
          name: entry.name.replace(/\.(md|txt)$/, ''),
          path: nodeRelPath,
          type: 'note',
        });
      }
    }

    // Sort: folders first, then according to sortOrder (defaults to name-asc)
    nodes.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'folder' ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });

    return nodes;
  }

  /**
   * Move an item (note or folder) to a new parent folder.
   */
  async moveItem(oldPath: string, newParentPath: string): Promise<string> {
    const absoluteOld = this.resolveNotePath(oldPath);
    if (!(await pathExists(absoluteOld))) {
      throw new Error(`Item to move does not exist: "${oldPath}"`);
    }

    const itemName = path.basename(absoluteOld);
    const absoluteNewParent = this.resolveNotePath(newParentPath);

    if (absoluteNewParent.startsWith(absoluteOld + path.sep) || absoluteNewParent === absoluteOld) {
      throw new Error(`Cannot move a folder into itself or its subfolder`);
    }

    await ensureDir(absoluteNewParent);

    const absoluteNew = path.join(absoluteNewParent, itemName);
    if (await pathExists(absoluteNew)) {
      throw new Error(`An item named "${itemName}" already exists in the destination folder`);
    }

    await fs.promises.rename(absoluteOld, absoluteNew);
    const cleanedNewParent = newParentPath.replace(/\/$/, '');
    return `${cleanedNewParent}/${itemName}`;
  }

  // ─── Folder Operations ────────────────────────────────────

  /**
   * Create a new folder inside .notes/.
   */
  async createFolder(name: string, parentPath: string): Promise<string> {
    const sanitized = sanitizeName(name);
    if (!isValidName(sanitized)) {
      throw new Error(`Invalid folder name: "${name}"`);
    }

    const parentAbsolute = this.resolveNotePath(parentPath);
    const folderPath = path.join(parentAbsolute, sanitized);

    if (await pathExists(folderPath)) {
      throw new Error(`Folder "${sanitized}" already exists`);
    }

    await ensureDir(folderPath);
    return parentPath && parentPath !== '/' ? `${parentPath}/${sanitized}` : `/${sanitized}`;
  }

  // ─── Note Operations ─────────────────────────────────────

  /**
   * Create a new note file.
   */
  async createNote(name: string, folderPath: string, content?: string): Promise<string> {
    const sanitized = sanitizeName(name);
    if (!isValidName(sanitized)) {
      throw new Error(`Invalid note name: "${name}"`);
    }

    const folderAbsolute = this.resolveNotePath(folderPath);
    await ensureDir(folderAbsolute);

    const fileName = await getUniqueName(folderAbsolute, sanitized, 'md');
    const filePath = path.join(folderAbsolute, fileName);

    const now = toISOString();
    const frontmatter = this.buildFrontmatter({
      title: sanitized,
      tags: [],
      created: now,
      modified: now,
      pinned: false,
    });

    const noteContent = content
      ? `${frontmatter}\n${content}`
      : `${frontmatter}\n# ${sanitized}\n\n`;

    await writeFileContent(filePath, noteContent);

    const notePath = folderPath === '/' || folderPath === ''
      ? `/${fileName}`
      : `${folderPath}/${fileName}`;

    return notePath;
  }

  /**
   * Read a note's content.
   */
  async readNote(notePath: string): Promise<string> {
    const absolutePath = this.resolveNotePath(notePath);
    if (!(await pathExists(absolutePath))) {
      throw new Error(`Note not found: "${notePath}"`);
    }
    return readFileContent(absolutePath);
  }

  /**
   * Write content to a note.
   */
  async writeNote(notePath: string, content: string): Promise<void> {
    const absolutePath = this.resolveNotePath(notePath);
    await writeFileContent(absolutePath, content);
  }

  // ─── Common Operations ───────────────────────────────────

  /**
   * Rename a file or folder.
   */
  async renameItem(oldPath: string, newName: string): Promise<string> {
    const sanitized = sanitizeName(newName);
    if (!isValidName(sanitized)) {
      throw new Error(`Invalid name: "${newName}"`);
    }

    const absoluteOld = this.resolveNotePath(oldPath);
    const isDir = await isDirectory(absoluteOld);
    const ext = isDir ? '' : path.extname(absoluteOld);
    const newFileName = isDir ? sanitized : `${sanitized}${ext}`;
    const absoluteNew = path.join(path.dirname(absoluteOld), newFileName);

    if (await pathExists(absoluteNew)) {
      throw new Error(`"${sanitized}" already exists`);
    }

    await fs.promises.rename(absoluteOld, absoluteNew);

    const parentPath = path.dirname(oldPath.replace(/\\/g, '/'));
    return `${parentPath}/${newFileName}`;
  }

  /**
   * Delete a file or folder.
   */
  async deleteItem(targetPath: string): Promise<void> {
    const absolutePath = this.resolveNotePath(targetPath);
    if (!(await pathExists(absolutePath))) {
      return; // Already deleted
    }
    await deleteRecursive(absolutePath);
  }

  // ─── Helpers ──────────────────────────────────────────────

  /**
   * Resolve a relative note path to an absolute file system path.
   */
  private resolveNotePath(relativePath: string): string {
    // Remove leading slash if present
    const cleaned = relativePath.replace(/^\//, '');
    return path.join(this.notesDir, cleaned);
  }

  /**
   * Build YAML frontmatter string from a NoteFrontmatter object.
   */
  private buildFrontmatter(fm: NoteFrontmatter): string {
    const lines = [
      '---',
      `title: "${fm.title}"`,
      `tags: [${fm.tags.join(', ')}]`,
      `created: ${fm.created}`,
      `modified: ${fm.modified}`,
      `pinned: ${fm.pinned}`,
    ];
    if (fm.template) {
      lines.push(`template: ${fm.template}`);
    }
    lines.push('---');
    return lines.join('\n');
  }
}
