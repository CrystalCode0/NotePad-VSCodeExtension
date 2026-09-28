/**
 * SearchService — Full-text search across all notes in the workspace.
 * Returns results with title, matching snippet, and position highlights.
 */

import { StorageService } from './storageService';
import { SearchResult, TreeNode } from '../models/types';

export class SearchService {
  constructor(private readonly storageService: StorageService) {}

  /**
   * Search all notes for a text query.
   */
  async search(query: string): Promise<SearchResult[]> {
    if (!query || query.trim().length === 0) {
      return [];
    }

    const trimmed = query.trim().toLowerCase();
    const tree = await this.storageService.getTree();
    const notePaths = this.collectNotePaths(tree);
    const results: SearchResult[] = [];

    for (const notePath of notePaths) {
      try {
        const fileName = notePath.split('/').pop() || '';
        const title = fileName.replace(/\.(md|txt)$/, '');
        const content = await this.storageService.readNote(notePath);

        const lowerContent = content.toLowerCase();
        const lowerTitle = title.toLowerCase();

        // 1. Check title match
        if (lowerTitle.includes(trimmed)) {
          const matchIndex = lowerTitle.indexOf(trimmed);
          results.push({
            title,
            path: notePath,
            snippet: title,
            matchPositions: [matchIndex],
          });
          continue;
        }

        // 2. Check content match
        const contentIndex = lowerContent.indexOf(trimmed);
        if (contentIndex !== -1) {
          // Extract snippet around match (approx 40 chars before, 80 after)
          const start = Math.max(0, contentIndex - 40);
          const end = Math.min(content.length, contentIndex + trimmed.length + 60);

          let snippet = content.substring(start, end).replace(/\r?\n/g, ' ');
          if (start > 0) snippet = '...' + snippet;
          if (end < content.length) snippet = snippet + '...';

          const snippetLower = snippet.toLowerCase();
          const snippetMatchPos = snippetLower.indexOf(trimmed);

          results.push({
            title,
            path: notePath,
            snippet,
            matchPositions: snippetMatchPos !== -1 ? [snippetMatchPos] : [0],
          });
        }
      } catch (err) {
        console.error(`[NotePad Search] Error reading ${notePath}:`, err);
      }
    }

    return results;
  }

  private collectNotePaths(nodes: TreeNode[]): string[] {
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
