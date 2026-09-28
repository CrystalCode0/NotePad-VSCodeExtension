/**
 * ConfigService — Manages the .notesconfig.json file.
 * Handles pins, tags, sort order, collapsed state, and note metadata.
 */

import * as path from 'path';
import { NotesConfig, NoteMetadata, SortOrder, CodeSnapshot, TemplateInfo } from '../models/types';
import { FS_CONSTANTS, DEFAULTS } from '../models/constants';
import { pathExists, readFileContent, writeFileContent } from '../utils/fileUtils';

const DEFAULT_CONFIG: NotesConfig = {
  version: '1.0.0',
  pinned: [],
  tags: {},
  sortOrder: DEFAULTS.SORT_ORDER,
  lastOpened: undefined,
  collapsedFolders: [],
  notes: {},
  codeSnapshots: {},
  customTemplates: [],
};

export class ConfigService {
  private configPath: string;
  private config: NotesConfig = { ...DEFAULT_CONFIG };

  constructor(private workspacePath: string) {
    this.configPath = path.join(
      workspacePath,
      FS_CONSTANTS.NOTES_DIR,
      FS_CONSTANTS.CONFIG_FILE
    );
  }

  // ─── Load / Save ─────────────────────────────────────────

  /**
   * Load config from disk, or create default if not found.
   */
  async load(): Promise<NotesConfig> {
    if (this.config) {
      return this.config;
    }

    if (await pathExists(this.configPath)) {
      try {
        const content = await readFileContent(this.configPath);
        this.config = { ...DEFAULT_CONFIG, ...JSON.parse(content) } as NotesConfig;
      } catch {
        this.config = { ...DEFAULT_CONFIG } as NotesConfig;
      }
    } else {
      this.config = { ...DEFAULT_CONFIG } as NotesConfig;
    }

    return this.config;
  }

  /**
   * Save current config to disk.
   */
  async save(): Promise<void> {
    await writeFileContent(this.configPath, JSON.stringify(this.config, null, 2));
  }

  // ─── Pins ─────────────────────────────────────────────────

  async getPinnedPaths(): Promise<string[]> {
    const config = await this.load();
    return config.pinned;
  }

  async togglePin(notePath: string): Promise<boolean> {
    const config = await this.load();
    const index = config.pinned.indexOf(notePath);
    const isPinned = index === -1;

    if (isPinned) {
      config.pinned.push(notePath);
    } else {
      config.pinned.splice(index, 1);
    }

    await this.save();
    return isPinned;
  }

  async isPinned(notePath: string): Promise<boolean> {
    const config = await this.load();
    return config.pinned.includes(notePath);
  }

  // ─── Tags ─────────────────────────────────────────────────

  async getTags(): Promise<Record<string, string[]>> {
    const config = await this.load();
    return config.tags;
  }

  async updateTagsForNote(notePath: string, tags: string[]): Promise<void> {
    const config = await this.load();

    // Remove this note from all existing tags
    for (const tag of Object.keys(config.tags)) {
      config.tags[tag] = config.tags[tag].filter((p) => p !== notePath);
      if (config.tags[tag].length === 0) {
        delete config.tags[tag];
      }
    }

    // Add to new tags
    for (const tag of tags) {
      const tagKey = tag.startsWith('#') ? tag : `#${tag}`;
      if (!config.tags[tagKey]) {
        config.tags[tagKey] = [];
      }
      config.tags[tagKey].push(notePath);
    }

    await this.save();
  }

  // ─── Sort Order ───────────────────────────────────────────

  async getSortOrder(): Promise<SortOrder> {
    const config = await this.load();
    return config.sortOrder;
  }

  async setSortOrder(order: SortOrder): Promise<void> {
    const config = await this.load();
    config.sortOrder = order;
    await this.save();
  }

  // ─── Collapsed Folders ────────────────────────────────────

  async getCollapsedFolders(): Promise<string[]> {
    const config = await this.load();
    return config.collapsedFolders;
  }

  async toggleFolderCollapsed(folderPath: string, expanded: boolean): Promise<void> {
    const config = await this.load();

    if (expanded) {
      config.collapsedFolders = config.collapsedFolders.filter((p) => p !== folderPath);
    } else {
      if (!config.collapsedFolders.includes(folderPath)) {
        config.collapsedFolders.push(folderPath);
      }
    }

    await this.save();
  }

  // ─── Note Metadata ───────────────────────────────────────

  async getNoteMetadata(notePath: string): Promise<NoteMetadata | null> {
    const config = await this.load();
    return config.notes[notePath] || null;
  }

  async setNoteMetadata(notePath: string, metadata: NoteMetadata): Promise<void> {
    const config = await this.load();
    config.notes[notePath] = metadata;
    await this.save();
  }

  async removeNoteMetadata(notePath: string): Promise<void> {
    const config = await this.load();
    delete config.notes[notePath];

    // Also remove from pinned
    config.pinned = config.pinned.filter((p) => p !== notePath);

    // Also remove from tags
    for (const tag of Object.keys(config.tags)) {
      config.tags[tag] = config.tags[tag].filter((p) => p !== notePath);
      if (config.tags[tag].length === 0) {
        delete config.tags[tag];
      }
    }

    await this.save();
  }

  // ─── Last Opened ──────────────────────────────────────────

  async setLastOpened(notePath: string): Promise<void> {
    const config = await this.load();
    config.lastOpened = notePath;
    await this.save();
  }

  async getLastOpened(): Promise<string | undefined> {
    const config = await this.load();
    return config.lastOpened;
  }

  // ─── Code Snapshots ───────────────────────────────────────

  async addSnapshot(snapshot: CodeSnapshot): Promise<void> {
    const config = await this.load();
    config.codeSnapshots[snapshot.id] = snapshot;
    await this.save();
  }

  async getSnapshot(snapshotId: string): Promise<CodeSnapshot | null> {
    const config = await this.load();
    return config.codeSnapshots[snapshotId] || null;
  }

  async getAllSnapshots(): Promise<Record<string, CodeSnapshot>> {
    const config = await this.load();
    return config.codeSnapshots;
  }

  async removeSnapshot(snapshotId: string): Promise<void> {
    const config = await this.load();
    delete config.codeSnapshots[snapshotId];
    await this.save();
  }

  // ─── Custom Templates ────────────────────────────────────

  async getCustomTemplates(): Promise<TemplateInfo[]> {
    const config = await this.load();
    return config.customTemplates;
  }

  async addCustomTemplate(template: TemplateInfo): Promise<void> {
    const config = await this.load();
    config.customTemplates.push(template);
    await this.save();
  }
}
