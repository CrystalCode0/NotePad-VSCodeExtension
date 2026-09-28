/**
 * Messages — Typed message protocol for Webview ↔ Extension communication.
 * Both sidebar and editor webviews use this contract.
 */

// ─── Sidebar → Extension ─────────────────────────────────────

export type SidebarToExtensionMessage =
  | { type: 'CREATE_FOLDER'; name: string; parentPath: string }
  | { type: 'CREATE_NOTE'; name: string; folderPath: string; templateId?: string }
  | { type: 'RENAME_ITEM'; oldPath: string; newName: string }
  | { type: 'DELETE_ITEM'; path: string; isFolder: boolean }
  | { type: 'OPEN_NOTE'; path: string }
  | { type: 'PIN_ITEM'; path: string; pinned: boolean }
  | { type: 'SEARCH'; query: string }
  | { type: 'FILTER_BY_TAG'; tag: string }
  | { type: 'TOGGLE_FOLDER'; path: string; expanded: boolean }
  | { type: 'MOVE_ITEM'; oldPath: string; newParentPath: string }
  | { type: 'REQUEST_TREE' }
  | { type: 'REQUEST_TEMPLATES' }
  | { type: 'REQUEST_TIMELINE' }
  | { type: 'SET_SORT_ORDER'; order: import('./types').SortOrder }
  | { type: 'WEBVIEW_READY' };

// ─── Extension → Sidebar ─────────────────────────────────────

export type ExtensionToSidebarMessage =
  | { type: 'TREE_UPDATED'; tree: import('./types').TreeNode[]; pinned: string[] }
  | { type: 'SEARCH_RESULTS'; results: import('./types').SearchResult[] }
  | { type: 'TEMPLATES_LIST'; templates: import('./types').TemplateInfo[] }
  | { type: 'TIMELINE_UPDATED'; groups: import('../services/timelineService').TimelineGroup[] }
  | { type: 'TAGS_UPDATED'; tags: Record<string, string[]> }
  | { type: 'ERROR'; message: string };

// ─── Editor → Extension ──────────────────────────────────────

export type EditorToExtensionMessage =
  | { type: 'SAVE_NOTE'; path: string; content: string }
  | { type: 'INSERT_CODE_SNAPSHOT' }
  | { type: 'JUMP_TO_SNAPSHOT'; snapshotId: string }
  | { type: 'CHECK_SNAPSHOT_DRIFT'; snapshotId: string }
  | { type: 'UPDATE_SNAPSHOT'; snapshotId: string }
  | { type: 'DELETE_SNAPSHOT'; snapshotId: string }
  | { type: 'OPEN_LINK'; url: string }
  | { type: 'ADD_TAG'; tag: string }
  | { type: 'REQUEST_NOTE_CONTENT'; path: string }
  | { type: 'EDITOR_READY' };

// ─── Extension → Editor ──────────────────────────────────────

export type ExtensionToEditorMessage =
  | { type: 'NOTE_LOADED'; path: string; content: string; metadata: import('./types').NoteMetadata | null; snapshots?: Record<string, import('./types').CodeSnapshot> }
  | { type: 'CODE_SNAPSHOT_DATA'; snapshot: import('./types').CodeSnapshot }
  | { type: 'SNAPSHOT_DRIFT_STATUS'; snapshotId: string; hasDrifted: boolean; currentCode?: string; startLine?: number; endLine?: number; status?: string; message?: string }
  | { type: 'SNAPSHOT_UPDATED'; snapshot: import('./types').CodeSnapshot }
  | { type: 'SNAPSHOT_DELETED'; snapshotId: string }
  | { type: 'SAVE_CONFIRMED'; path: string }
  | { type: 'ERROR'; message: string };
