/**
 * TagService — Extracts, indexes, and filters smart tags (#tag) across notes.
 */

import { ConfigService } from './configService';
import { StorageService } from './storageService';

export class TagService {
  constructor(
    private readonly configService: ConfigService,
    private readonly storageService: StorageService
  ) {}

  /**
   * Extract tags from markdown content and frontmatter.
   * Matches `#tag` but excludes Markdown headers (`# Header`, `## Sub`).
   */
  extractTags(content: string): string[] {
    const tags = new Set<string>();

    // 1. Extract from YAML frontmatter if present
    const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (frontmatterMatch) {
      const fmLines = frontmatterMatch[1].split(/\r?\n/);
      for (const line of fmLines) {
        const tagLineMatch = line.match(/^tags:\s*\[(.*?)\]/);
        if (tagLineMatch) {
          const items = tagLineMatch[1].split(',').map((t) => t.trim().replace(/^['"]|['"]$/g, ''));
          for (const item of items) {
            if (item) {
              const normalized = item.startsWith('#') ? item.toLowerCase() : `#${item.toLowerCase()}`;
              tags.add(normalized);
            }
          }
        }
      }
    }

    // 2. Extract inline #tags from body
    // Regex looks for whitespace or start of line followed by # and alphanumeric/dash/underscore
    // It must NOT match # followed by space (which is a markdown header)
    const inlineTagRegex = /(?:^|\s)(#([a-zA-Z0-9_\-]+))(?=\s|$|[.,;:!?])/g;
    let match: RegExpExecArray | null;

    while ((match = inlineTagRegex.exec(content)) !== null) {
      const tag = match[1].toLowerCase();
      // Ignore bare '#' or headings
      if (tag.length > 1) {
        tags.add(tag);
      }
    }

    return Array.from(tags).sort();
  }

  /**
   * Re-index tags for a specific note.
   */
  async updateNoteTags(notePath: string, content: string): Promise<string[]> {
    const tags = this.extractTags(content);
    await this.configService.updateTagsForNote(notePath, tags);
    return tags;
  }

  /**
   * Scan all notes in .notes/ and rebuild the entire tag index.
   */
  async reindexAllNotes(): Promise<Record<string, string[]>> {
    const tree = await this.storageService.getTree();
    const allNotePaths = this.collectNotePaths(tree);

    for (const notePath of allNotePaths) {
      try {
        const content = await this.storageService.readNote(notePath);
        const tags = this.extractTags(content);
        await this.configService.updateTagsForNote(notePath, tags);
      } catch (err) {
        console.error(`[NotePad] Error indexing note ${notePath}:`, err);
      }
    }

    return this.configService.getTags();
  }

  /**
   * Get all notes associated with a given tag.
   */
  async getNotesForTag(tag: string): Promise<string[]> {
    const normalized = tag.startsWith('#') ? tag.toLowerCase() : `#${tag.toLowerCase()}`;
    const allTags = await this.configService.getTags();
    return allTags[normalized] || [];
  }

  private collectNotePaths(nodes: import('../models/types').TreeNode[]): string[] {
    const paths: string[] = [];
    for (const node of nodes) {
      if (node.type === 'note') {
        paths.push(node.path);
      } else if (node.children) {
        paths.push(...this.collectNotePaths(node.children));
      }
    }
    return paths;
  }
}
