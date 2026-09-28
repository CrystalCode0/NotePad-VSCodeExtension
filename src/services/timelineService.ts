/**
 * TimelineService — Groups notes into temporal buckets (Today, Yesterday, This Week, Older).
 */

import { ConfigService } from './configService';
import { StorageService } from './storageService';
import { relativeTime } from '../utils/dateUtils';
import { TreeNode } from '../models/types';

export type TimelineBucket = 'Today' | 'Yesterday' | 'This Week' | 'This Month' | 'Older';

export interface TimelineGroup {
  bucket: TimelineBucket;
  notes: {
    path: string;
    title: string;
    modifiedAt: string;
    relativeTime: string;
  }[];
}

export class TimelineService {
  constructor(
    private readonly storageService: StorageService,
    private readonly configService: ConfigService
  ) {}

  /**
   * Get notes grouped by modification timestamp into temporal buckets.
   */
  async getTimeline(): Promise<TimelineGroup[]> {
    const tree = await this.storageService.getTree();
    const notePaths = this.collectNotePaths(tree);
    const now = new Date();

    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterdayStart = todayStart - 86400000;
    const weekStart = todayStart - 7 * 86400000;
    const monthStart = todayStart - 30 * 86400000;

    const buckets: Record<TimelineBucket, TimelineGroup['notes']> = {
      'Today': [],
      'Yesterday': [],
      'This Week': [],
      'This Month': [],
      'Older': [],
    };

    for (const notePath of notePaths) {
      const fileName = notePath.split('/').pop() || '';
      const title = fileName.replace(/\.(md|txt)$/, '');
      const meta = await this.configService.getNoteMetadata(notePath);

      const modifiedAt = meta?.modifiedAt || meta?.createdAt || new Date().toISOString();
      const timeMs = new Date(modifiedAt).getTime();
      const relTime = relativeTime(modifiedAt);

      const item = {
        path: notePath,
        title,
        modifiedAt,
        relativeTime: relTime,
      };

      if (timeMs >= todayStart) {
        buckets['Today'].push(item);
      } else if (timeMs >= yesterdayStart) {
        buckets['Yesterday'].push(item);
      } else if (timeMs >= weekStart) {
        buckets['This Week'].push(item);
      } else if (timeMs >= monthStart) {
        buckets['This Month'].push(item);
      } else {
        buckets['Older'].push(item);
      }
    }

    const order: TimelineBucket[] = ['Today', 'Yesterday', 'This Week', 'This Month', 'Older'];
    const groups: TimelineGroup[] = [];

    for (const b of order) {
      if (buckets[b].length > 0) {
        buckets[b].sort((a, bItem) => new Date(bItem.modifiedAt).getTime() - new Date(a.modifiedAt).getTime());
        groups.push({
          bucket: b,
          notes: buckets[b],
        });
      }
    }

    return groups;
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
