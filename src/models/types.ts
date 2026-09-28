/**
 * Types — All TypeScript interfaces and type definitions for the extension.
 */

// ─── Tree Node Types ──────────────────────────────────────────

export type TreeNodeType = 'folder' | 'note';

export interface TreeNode {
  /** Display name (e.g., "Meeting Notes") */
  name: string;
  /** Relative path from .notes/ (e.g., "/Work/meeting-notes.md") */
  path: string;
  /** Whether this is a folder or a note */
  type: TreeNodeType;
  /** Children nodes (only for folders) */
  children?: TreeNode[];
  /** Whether the folder is expanded in the UI */
  expanded?: boolean;
}

// ─── Note Metadata ────────────────────────────────────────────

export interface NoteMetadata {
  /** ISO timestamp of creation */
  createdAt: string;
  /** ISO timestamp of last modification */
  modifiedAt: string;
  /** File that was active when note was created */
  createdFrom?: string;
  /** Git branch active when note was created */
  branch?: string;
  /** Template used to create this note */
  templateUsed?: string;
}

// ─── Note Frontmatter ─────────────────────────────────────────

export interface NoteFrontmatter {
  title: string;
  tags: string[];
  created: string;
  modified: string;
  pinned: boolean;
  template?: string;
}

// ─── Code Snapshot ────────────────────────────────────────────

export interface CodeSnapshot {
  /** Unique snapshot ID */
  id: string;
  /** The note file this snapshot belongs to */
  noteFile: string;
  /** Source file path (relative to workspace) */
  sourceFile: string;
  /** Start line in source file */
  startLine: number;
  /** End line in source file */
  endLine: number;
  /** Captured code text at time of snapshot */
  capturedCode: string;
  /** ISO timestamp when snapshot was taken */
  capturedAt: string;
  /** Hash of source file at capture time (for change detection) */
  sourceHash: string;
}

// ─── Config File ──────────────────────────────────────────────

export type SortOrder = 'name-asc' | 'name-desc' | 'date-asc' | 'date-desc';

export interface NotesConfig {
  /** Config schema version */
  version: string;
  /** Pinned note paths */
  pinned: string[];
  /** Tag index: tag name → note paths */
  tags: Record<string, string[]>;
  /** Current sort order */
  sortOrder: SortOrder;
  /** Last opened note path */
  lastOpened?: string;
  /** Collapsed folder paths */
  collapsedFolders: string[];
  /** Per-note metadata */
  notes: Record<string, NoteMetadata>;
  /** Code snapshots */
  codeSnapshots: Record<string, CodeSnapshot>;
  /** Custom templates */
  customTemplates: TemplateInfo[];
}

// ─── Templates ────────────────────────────────────────────────

export interface TemplateInfo {
  /** Unique template ID */
  id: string;
  /** Display name */
  name: string;
  /** Description shown in template picker */
  description?: string;
  /** File path (relative to .notes/) */
  file?: string;
  /** Whether this is a built-in template */
  builtIn?: boolean;
}

// ─── Search ───────────────────────────────────────────────────

export interface SearchResult {
  /** Note title */
  title: string;
  /** Note path */
  path: string;
  /** Matching text snippet */
  snippet: string;
  /** Match positions for highlighting */
  matchPositions: number[];
}
