/**
 * Constants — All command IDs, config keys, and default values.
 * Single source of truth for string identifiers used across the extension.
 */

// ─── Command IDs ──────────────────────────────────────────────
export const COMMANDS = {
  CREATE_FOLDER: 'notepad.createFolder',
  CREATE_NOTE: 'notepad.createNote',
  CREATE_NOTE_FROM_TEMPLATE: 'notepad.createNoteFromTemplate',
  RENAME_ITEM: 'notepad.renameItem',
  DELETE_ITEM: 'notepad.deleteItem',
  PIN_ITEM: 'notepad.pinItem',
  SEARCH_NOTES: 'notepad.searchNotes',
  QUICK_CAPTURE: 'notepad.quickCapture',
  INSERT_SNAPSHOT: 'notepad.insertSnapshot',
  FILTER_BY_TAG: 'notepad.filterByTag',
  REFRESH_EXPLORER: 'notepad.refreshExplorer',
  FOCUS_MODE: 'notepad.focusMode',
} as const;

// ─── View IDs ─────────────────────────────────────────────────
export const VIEWS = {
  SIDEBAR_CONTAINER: 'notepad-sidebar',
  EXPLORER: 'notepad-explorer',
} as const;

// ─── Config Keys ──────────────────────────────────────────────
export const CONFIG = {
  AUTO_SAVE_DELAY: 'notepad.autoSaveDelay',
  DEFAULT_NOTE_FORMAT: 'notepad.defaultNoteFormat',
  SHOW_GIT_BRANCH: 'notepad.showGitBranch',
  QUICK_CAPTURE_FOLDER: 'notepad.quickCaptureFolder',
} as const;

// ─── File System ──────────────────────────────────────────────
export const FS_CONSTANTS = {
  NOTES_DIR: '.notes',
  CONFIG_FILE: '.notesconfig.json',
  TEMPLATES_DIR: '.templates',
  QUICK_NOTES_FOLDER: 'Quick Notes',
} as const;

// ─── Defaults ─────────────────────────────────────────────────
export const DEFAULTS = {
  AUTO_SAVE_DELAY: 1000,
  NOTE_FORMAT: 'md',
  SORT_ORDER: 'name-asc' as const,
} as const;
