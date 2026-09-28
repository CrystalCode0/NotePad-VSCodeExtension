/**
 * MessageHandler — Central message router between Webview UIs and backend services.
 * Receives messages from sidebar/editor webviews and dispatches to appropriate services.
 */

import * as vscode from 'vscode';
import { SidebarToExtensionMessage } from '../models/messages';
import { StorageService } from '../services/storageService';
import { ConfigService } from '../services/configService';
import { TemplateService } from '../services/templateService';
import { SearchService } from '../services/searchService';
import { TagService } from '../services/tagService';
import { TimelineService } from '../services/timelineService';
import { toISOString } from '../utils/dateUtils';
import { getCurrentBranch } from '../utils/gitUtils';

export class MessageHandler {
  constructor(
    private readonly storageService: StorageService,
    private readonly configService: ConfigService,
    private readonly templateService: TemplateService,
    private readonly searchService: SearchService,
    private readonly tagService: TagService,
    private readonly timelineService: TimelineService,
    private readonly workspacePath: string
  ) {}

  /**
   * Handle messages from the sidebar webview.
   */
  async handleSidebarMessage(
    message: SidebarToExtensionMessage,
    webviewView: vscode.WebviewView
  ): Promise<void> {
    try {
      switch (message.type) {
        case 'WEBVIEW_READY':
        case 'REQUEST_TREE':
          await this.sendTreeUpdate(webviewView);
          await this.sendTagsUpdate(webviewView);
          break;

        case 'CREATE_FOLDER': {
          await this.storageService.createFolder(message.name, message.parentPath);
          await this.sendTreeUpdate(webviewView);
          break;
        }

        case 'CREATE_NOTE': {
          let initialContent: string | undefined;
          let templateUsed: string | undefined;

          if (message.templateId) {
            templateUsed = message.templateId;
            initialContent = await this.templateService.instantiateTemplate(
              message.templateId,
              message.name
            );
          }

          const notePath = await this.storageService.createNote(
            message.name,
            message.folderPath,
            initialContent
          );

          const branch = await getCurrentBranch(this.workspacePath);

          // Store metadata with branch & template context
          await this.configService.setNoteMetadata(notePath, {
            createdAt: toISOString(),
            modifiedAt: toISOString(),
            branch: branch || undefined,
            templateUsed,
          });

          // Index any initial tags from content
          if (initialContent) {
            await this.tagService.updateNoteTags(notePath, initialContent);
          }

          await this.sendTreeUpdate(webviewView);
          await this.sendTagsUpdate(webviewView);

          // Auto-open created note
          vscode.commands.executeCommand('notepad._internal.openNote', notePath);
          break;
        }

        case 'RENAME_ITEM': {
          const newPath = await this.storageService.renameItem(message.oldPath, message.newName);
          // Update metadata key
          const oldMeta = await this.configService.getNoteMetadata(message.oldPath);
          if (oldMeta) {
            await this.configService.removeNoteMetadata(message.oldPath);
            await this.configService.setNoteMetadata(newPath, oldMeta);
          }
          await this.sendTreeUpdate(webviewView);
          break;
        }

        case 'DELETE_ITEM': {
          await this.storageService.deleteItem(message.path);
          await this.configService.removeNoteMetadata(message.path);
          await this.sendTreeUpdate(webviewView);
          await this.sendTagsUpdate(webviewView);
          break;
        }

        case 'OPEN_NOTE': {
          await this.configService.setLastOpened(message.path);
          // The actual opening is handled by NoteEditorProvider
          vscode.commands.executeCommand('notepad._internal.openNote', message.path);
          break;
        }

        case 'PIN_ITEM': {
          await this.configService.togglePin(message.path);
          await this.sendTreeUpdate(webviewView);
          break;
        }

        case 'TOGGLE_FOLDER': {
          await this.configService.toggleFolderCollapsed(message.path, message.expanded);
          break;
        }

        case 'MOVE_ITEM': {
          await this.storageService.moveItem(message.oldPath, message.newParentPath);
          await this.sendTreeUpdate(webviewView);
          break;
        }

        case 'SEARCH': {
          const results = await this.searchService.search(message.query);
          webviewView.webview.postMessage({
            type: 'SEARCH_RESULTS',
            results,
          });
          break;
        }

        case 'FILTER_BY_TAG': {
          const notePaths = await this.tagService.getNotesForTag(message.tag);
          // Filter tree to only notes with this tag
          const results = notePaths.map((p) => ({
            title: p.split('/').pop()?.replace(/\.(md|txt)$/, '') || 'Note',
            path: p,
            snippet: `Tagged with ${message.tag}`,
            matchPositions: [0],
          }));
          webviewView.webview.postMessage({
            type: 'SEARCH_RESULTS',
            results,
          });
          break;
        }

        case 'REQUEST_TEMPLATES': {
          const templates = await this.templateService.listTemplates();
          webviewView.webview.postMessage({
            type: 'TEMPLATES_LIST',
            templates,
          });
          break;
        }

        case 'REQUEST_TIMELINE': {
          const groups = await this.timelineService.getTimeline();
          webviewView.webview.postMessage({
            type: 'TIMELINE_UPDATED',
            groups,
          });
          break;
        }

        case 'SET_SORT_ORDER': {
          await this.configService.setSortOrder(message.order);
          await this.sendTreeUpdate(webviewView);
          break;
        }

        default:
          console.warn('[NotePad] Unknown sidebar message type:', (message as any).type);
      }
    } catch (error: any) {
      webviewView.webview.postMessage({
        type: 'ERROR',
        message: error.message || 'An unexpected error occurred',
      });
      vscode.window.showErrorMessage(`NotePad: ${error.message}`);
    }
  }

  // ─── Helpers ──────────────────────────────────────────────

  /**
   * Send the full tree + pinned data to the sidebar webview.
   */
  public async sendTreeUpdate(webviewView: vscode.WebviewView): Promise<void> {
    const tree = await this.storageService.getTree();
    const pinned = await this.configService.getPinnedPaths();

    webviewView.webview.postMessage({
      type: 'TREE_UPDATED',
      tree,
      pinned,
    });
  }

  /**
   * Send tag data to the sidebar webview.
   */
  public async sendTagsUpdate(webviewView: vscode.WebviewView): Promise<void> {
    const tags = await this.configService.getTags();

    webviewView.webview.postMessage({
      type: 'TAGS_UPDATED',
      tags,
    });
  }
}
