/**
 * NoteEditorProvider — Manages WebviewPanels for the rich note editor.
 * Each open note gets its own WebviewPanel tab in the editor area.
 */

import * as vscode from 'vscode';
import { StorageService } from '../services/storageService';
import { ConfigService } from '../services/configService';
import { SnapshotService } from '../services/snapshotService';
import { TagService } from '../services/tagService';
import { EditorToExtensionMessage } from '../models/messages';
import { toISOString } from '../utils/dateUtils';

export class NoteEditorProvider {
  /** Map of note path → active WebviewPanel */
  private panels: Map<string, vscode.WebviewPanel> = new Map();

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly storageService: StorageService,
    private readonly configService: ConfigService,
    private readonly snapshotService: SnapshotService,
    private readonly tagService: TagService
  ) {}

  /**
   * Open a note in a WebviewPanel editor tab.
   */
  async openNote(notePath: string): Promise<void> {
    // If already open, reveal it
    const existing = this.panels.get(notePath);
    if (existing) {
      existing.reveal(vscode.ViewColumn.One);
      return;
    }

    // Read the note content and metadata
    const content = await this.storageService.readNote(notePath);
    const metadata = await this.configService.getNoteMetadata(notePath);
    const allSnapshots = await this.configService.getAllSnapshots();

    // Filter snapshots that belong to this note
    const noteSnapshots: Record<string, import('../models/types').CodeSnapshot> = {};
    for (const [id, snap] of Object.entries(allSnapshots)) {
      if (snap.noteFile === notePath) {
        noteSnapshots[id] = snap;
      }
    }

    // Extract display name from path
    const fileName = notePath.split('/').pop() || 'Note';
    const displayName = fileName.replace(/\.(md|txt)$/, '');

    // Create a new WebviewPanel
    const panel = vscode.window.createWebviewPanel(
      'notepad.editor',
      `📝 ${displayName}`,
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [this.extensionUri],
      }
    );

    this.panels.set(notePath, panel);

    // Set the HTML content
    panel.webview.html = this.getEditorContent(panel.webview, notePath);

    // Send the note content once the webview is ready
    panel.webview.onDidReceiveMessage(
      async (message: EditorToExtensionMessage) => {
        try {
          switch (message.type) {
            case 'EDITOR_READY': {
              panel.webview.postMessage({
                type: 'NOTE_LOADED',
                path: notePath,
                content,
                metadata,
                snapshots: noteSnapshots,
              });
              break;
            }

            case 'SAVE_NOTE': {
              await this.storageService.writeNote(message.path, message.content);
              
              // Update modified timestamp in config
              const existingMeta = await this.configService.getNoteMetadata(message.path);
              await this.configService.setNoteMetadata(message.path, {
                ...(existingMeta || { createdAt: toISOString() }),
                modifiedAt: toISOString(),
              });

              // Automatically extract and index tags from note content
              await this.tagService.updateNoteTags(message.path, message.content);

              panel.webview.postMessage({
                type: 'SAVE_CONFIRMED',
                path: message.path,
              });
              break;
            }

            case 'INSERT_CODE_SNAPSHOT': {
              const snapshot = await this.snapshotService.captureActiveSelection(notePath);
              if (snapshot) {
                panel.webview.postMessage({
                  type: 'CODE_SNAPSHOT_DATA',
                  snapshot,
                });
                vscode.window.showInformationMessage(
                  `📸 Captured snapshot from ${snapshot.sourceFile}:${snapshot.startLine}-${snapshot.endLine}`
                );
              }
              break;
            }

            case 'JUMP_TO_SNAPSHOT': {
              await this.snapshotService.jumpToSource(message.snapshotId);
              break;
            }

            case 'CHECK_SNAPSHOT_DRIFT': {
              const result = await this.snapshotService.checkCodeDrift(message.snapshotId);
              panel.webview.postMessage({
                type: 'SNAPSHOT_DRIFT_STATUS',
                snapshotId: message.snapshotId,
                hasDrifted: result.hasDrifted,
                currentCode: result.currentCode,
              });
              break;
            }

            case 'UPDATE_SNAPSHOT': {
              const updated = await this.snapshotService.updateSnapshotFromSource(message.snapshotId);
              if (updated) {
                panel.webview.postMessage({
                  type: 'SNAPSHOT_UPDATED',
                  snapshot: updated,
                });
                vscode.window.showInformationMessage('📸 Code snapshot refreshed to match source file.');
              }
              break;
            }

            case 'DELETE_SNAPSHOT': {
              await this.snapshotService.deleteSnapshot(message.snapshotId);
              panel.webview.postMessage({
                type: 'SNAPSHOT_DELETED',
                snapshotId: message.snapshotId,
              });
              vscode.window.showInformationMessage('📸 Code snapshot deleted.');
              break;
            }

            case 'OPEN_LINK': {
              if (message.url) {
                try {
                  const uri = vscode.Uri.parse(message.url);
                  vscode.env.openExternal(uri);
                } catch {
                  vscode.window.showErrorMessage(`NotePad: Invalid URL ${message.url}`);
                }
              }
              break;
            }

            case 'ADD_TAG': {
              // Append tag to note
              break;
            }

            case 'REQUEST_NOTE_CONTENT': {
              const noteContent = await this.storageService.readNote(message.path);
              const noteMeta = await this.configService.getNoteMetadata(message.path);
              panel.webview.postMessage({
                type: 'NOTE_LOADED',
                path: message.path,
                content: noteContent,
                metadata: noteMeta,
              });
              break;
            }
          }
        } catch (error: any) {
          panel.webview.postMessage({
            type: 'ERROR',
            message: error.message,
          });
          vscode.window.showErrorMessage(`NotePad: ${error.message}`);
        }
      }
    );

    // Clean up when panel is closed
    panel.onDidDispose(() => {
      this.panels.delete(notePath);
    });

    // Update last opened
    await this.configService.setLastOpened(notePath);
  }

  /**
   * Build the HTML content for the note editor webview.
   */
  private getEditorContent(webview: vscode.Webview, notePath: string): string {
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'webview-ui', 'editor', 'editor.css')
    );
    const sharedThemeUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'webview-ui', 'shared', 'theme.css')
    );
    const sharedResetUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'webview-ui', 'shared', 'reset.css')
    );
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'webview-ui', 'editor', 'editor.js')
    );

    const nonce = getNonce();

    return /*html*/ `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="Content-Security-Policy"
              content="default-src 'none';
                       style-src ${webview.cspSource} 'unsafe-inline';
                       script-src 'nonce-${nonce}';
                       font-src ${webview.cspSource};">
        <link rel="stylesheet" href="${sharedResetUri}">
        <link rel="stylesheet" href="${sharedThemeUri}">
        <link rel="stylesheet" href="${styleUri}">
        <title>Note Editor</title>
      </head>
      <body>
        <!-- Formatting Toolbar -->
        <div class="editor-toolbar">
          <button class="toolbar-btn" data-command="bold" title="Bold (Ctrl+B)">
            <strong>B</strong>
          </button>
          <button class="toolbar-btn" data-command="italic" title="Italic (Ctrl+I)">
            <em>I</em>
          </button>
          <button class="toolbar-btn" data-command="heading" title="Heading (H1 - H3)">
            H
          </button>
          <div class="toolbar-separator"></div>
          <button class="toolbar-btn" data-command="unordered-list" title="Bullet List">
            ≡
          </button>
          <button class="toolbar-btn" data-command="ordered-list" title="Numbered List">
            1.
          </button>
          <button class="toolbar-btn" data-command="checklist" title="Interactive Task / Checklist (Ctrl+Shift+C)">
            ☑
          </button>
          <div class="toolbar-separator"></div>
          <button class="toolbar-btn" data-command="code" title="Code Block">
            &lt;&gt;
          </button>
          <button class="toolbar-btn" data-command="link" title="Link">
            🔗
          </button>
          <button class="toolbar-btn" data-command="snapshot" title="Insert Code Snapshot from Selection">
            📸
          </button>
          <div class="toolbar-separator"></div>
          <button class="toolbar-btn" data-command="tag" title="Insert Tag #">
            🏷️
          </button>

          <div class="toolbar-spacer"></div>

          <!-- View Mode Toggle (Interactive Rich vs Raw Markdown) -->
          <div class="mode-toggle-group">
            <button class="mode-toggle-btn active" id="btn-mode-rich" title="Interactive Rich View (click tasks to complete)">
              <span>✨ Interactive</span>
            </button>
            <button class="mode-toggle-btn" id="btn-mode-raw" title="Raw Markdown Source">
              <span>📝 Source</span>
            </button>
          </div>
        </div>

        <!-- Snapshots Container (Displays interactive cards for snapshots in note) -->
        <div class="snapshots-container" id="snapshots-container"></div>

        <!-- Editor Content Area -->
        <div class="editor-content" id="editor-content">
          <!-- Rich In-Place Interactive Editor -->
          <div class="rich-editor" id="rich-editor" contenteditable="true" spellcheck="true" role="textbox" aria-multiline="true" placeholder="Start writing or typing / for features..."></div>

          <!-- Raw Markdown Source Textarea -->
          <textarea class="editor-textarea" 
                    id="editor-textarea" 
                    placeholder="Start writing your note..."
                    spellcheck="true"
                    style="display: none;"></textarea>
        </div>

        <!-- Status Bar -->
        <div class="editor-statusbar">
          <span class="status-item" id="status-words">Words: 0</span>
          <span class="status-separator">│</span>
          <span class="status-item" id="status-chars">Chars: 0</span>
          <span class="status-separator" id="status-tasks-sep" style="display: none;">│</span>
          <div class="status-tasks-widget" id="status-tasks-widget" style="display: none;">
            <span class="tasks-badge" id="tasks-badge">Tasks: 0/0</span>
            <div class="tasks-progress-track">
              <div class="tasks-progress-bar" id="tasks-progress-bar" style="width: 0%;"></div>
            </div>
          </div>
          <span class="status-separator">│</span>
          <span class="status-item status-save" id="status-save">
            <span class="save-indicator saved">✓ Saved</span>
          </span>
          <span class="status-separator">│</span>
          <span class="status-item" id="status-branch" title="Git Branch"></span>
          <span class="status-separator">│</span>
          <span class="status-item" id="status-time"></span>
        </div>

        <!-- Link Modal -->
        <div class="editor-modal-overlay" id="modal-link-overlay" style="display: none;">
          <div class="editor-modal">
            <div class="editor-modal-header">
              <h3>🔗 Insert Link</h3>
              <button class="modal-close-btn" id="modal-link-close" type="button" title="Close">✕</button>
            </div>
            <div class="editor-modal-body">
              <label class="modal-label" for="modal-link-text">Display Text</label>
              <input class="modal-input" type="text" id="modal-link-text" placeholder="Link text (optional)" />
              <label class="modal-label" for="modal-link-url" style="margin-top: 8px;">Target URL</label>
              <input class="modal-input" type="text" id="modal-link-url" placeholder="https://example.com" />
            </div>
            <div class="editor-modal-footer">
              <button class="modal-btn btn-secondary" id="modal-link-cancel" type="button">Cancel</button>
              <button class="modal-btn btn-primary" id="modal-link-insert" type="button">Insert Link</button>
            </div>
          </div>
        </div>

        <!-- Tag Modal -->
        <div class="editor-modal-overlay" id="modal-tag-overlay" style="display: none;">
          <div class="editor-modal">
            <div class="editor-modal-header">
              <h3>🏷️ Insert Tag</h3>
              <button class="modal-close-btn" id="modal-tag-close" type="button" title="Close">✕</button>
            </div>
            <div class="editor-modal-body">
              <label class="modal-label" for="modal-tag-name">Tag Name</label>
              <div class="modal-tag-input-wrap">
                <span class="modal-tag-hash">#</span>
                <input class="modal-input modal-tag-input" type="text" id="modal-tag-name" placeholder="e.g. todo, bug, feature" />
              </div>
              <div class="modal-quick-tags" id="modal-quick-tags">
                <span class="quick-tag-label">Suggestions:</span>
                <button type="button" class="quick-tag-chip" data-tag="todo">#todo</button>
                <button type="button" class="quick-tag-chip" data-tag="idea">#idea</button>
                <button type="button" class="quick-tag-chip" data-tag="bug">#bug</button>
                <button type="button" class="quick-tag-chip" data-tag="note">#note</button>
                <button type="button" class="quick-tag-chip" data-tag="docs">#docs</button>
              </div>
            </div>
            <div class="editor-modal-footer">
              <button class="modal-btn btn-secondary" id="modal-tag-cancel" type="button">Cancel</button>
              <button class="modal-btn btn-primary" id="modal-tag-insert" type="button">Insert Tag</button>
            </div>
          </div>
        </div>

        <script nonce="${nonce}" src="${scriptUri}"></script>
      </body>
      </html>
    `;
  }
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
