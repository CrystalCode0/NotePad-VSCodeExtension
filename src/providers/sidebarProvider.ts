/**
 * SidebarProvider — WebviewViewProvider that hosts the sidebar UI.
 * Renders custom HTML/CSS/JS in the VS Code sidebar panel and
 * handles bidirectional communication with the extension backend.
 */

import * as vscode from 'vscode';
import { MessageHandler } from '../handlers/messageHandler';
import { SidebarToExtensionMessage } from '../models/messages';

export class SidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'notepad-explorer';

  private _view?: vscode.WebviewView;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly messageHandler: MessageHandler
  ) {}

  /**
   * Called when the webview view is first resolved (user opens the sidebar).
   */
  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void | Thenable<void> {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

    webviewView.webview.html = this.getWebviewContent(webviewView.webview);

    // Listen for messages from the webview
    webviewView.webview.onDidReceiveMessage(
      (message: SidebarToExtensionMessage) => {
        this.messageHandler.handleSidebarMessage(message, webviewView);
      }
    );

    // When view becomes visible again, refresh the tree
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        webviewView.webview.postMessage({ type: 'REQUEST_TREE' });
      }
    });
  }

  /**
   * Refresh the tree from outside (e.g., file watcher triggers).
   */
  public refresh(): void {
    if (this._view) {
      this._view.webview.postMessage({ type: 'REQUEST_TREE' });
    }
  }

  /**
   * Build the full HTML content for the sidebar webview.
   */
  private getWebviewContent(webview: vscode.Webview): string {
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'webview-ui', 'sidebar', 'sidebar.css')
    );
    const sharedThemeUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'webview-ui', 'shared', 'theme.css')
    );
    const sharedResetUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'webview-ui', 'shared', 'reset.css')
    );
    const sharedAnimationsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'webview-ui', 'shared', 'animations.css')
    );
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'webview-ui', 'sidebar', 'sidebar.js')
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
        <link rel="stylesheet" href="${sharedAnimationsUri}">
        <link rel="stylesheet" href="${styleUri}">
        <title>NotePad</title>
      </head>
      <body>
        <!-- Header -->
        <div class="notepad-header">
          <span class="notepad-title">NOTEPAD</span>
          <div class="notepad-header-actions">
            <button class="icon-btn" id="btn-search" title="Search Notes">
              🔍
            </button>
            <button class="icon-btn" id="btn-new-template" title="New from Template">
              📋
            </button>
            <button class="icon-btn" id="btn-timeline" title="Toggle Timeline View">
              📅
            </button>
            <button class="icon-btn" id="btn-new-folder" title="New Folder">
              📁+
            </button>
            <button class="icon-btn" id="btn-new-note" title="New Note">
              📝+
            </button>
            <button class="icon-btn" id="btn-refresh" title="Refresh">
              🔄
            </button>
          </div>
        </div>

        <!-- Search Bar (hidden by default) -->
        <div class="search-container" id="search-container" style="display: none;">
          <input type="text" 
                 class="search-input" 
                 id="search-input" 
                 placeholder="Search note titles & content..." 
                 autocomplete="off" />
          <button class="icon-btn search-close" id="btn-search-close" title="Close Search">✕</button>
        </div>

        <!-- Pinned Section -->
        <div class="section pinned-section" id="pinned-section" style="display: none;">
          <div class="section-header">
            <span>⭐</span>
            <span class="section-title">Pinned Notes</span>
          </div>
          <div class="pinned-list" id="pinned-list"></div>
        </div>

        <!-- Main Tree Section -->
        <div class="section tree-section" id="section-tree">
          <div class="section-header" style="justify-content: space-between;">
            <div style="display: flex; align-items: center; gap: 4px;">
              <span>📁</span>
              <span class="section-title" id="tree-section-title">Folders & Notes</span>
            </div>
            <select class="sort-select" id="sort-select" title="Sort Notes">
              <option value="name-asc">A → Z</option>
              <option value="name-desc">Z → A</option>
            </select>
          </div>
          <div class="tree-container" id="tree-container">
            <!-- Empty state -->
            <div class="empty-state" id="empty-state">
              <div class="empty-icon">📝</div>
              <p class="empty-text">No notes yet</p>
              <p class="empty-subtext">Create a folder or note to get started</p>
              <div style="display: flex; gap: 8px; margin-top: 8px;">
                <button class="primary-btn" id="btn-empty-new-folder">
                  New Folder
                </button>
                <button class="primary-btn" id="btn-empty-new-note">
                  New Note
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Timeline Section (toggled on demand) -->
        <div class="section timeline-section" id="section-timeline" style="display: none;">
          <div class="section-header">
            <span>📅</span>
            <span class="section-title">Timeline</span>
          </div>
          <div class="timeline-container" id="timeline-container"></div>
        </div>

        <!-- Tag Cloud Section -->
        <div class="section tag-section" id="tag-section" style="display: none;">
          <div class="section-header">
            <span>🏷️</span>
            <span class="section-title">Smart Tags</span>
          </div>
          <div class="tag-cloud" id="tag-cloud"></div>
        </div>

        <!-- Context Menu (hidden, positioned absolutely) -->
        <div class="context-menu" id="context-menu" style="display: none;">
          <div class="context-menu-item" data-action="rename">
            <span>✏️</span> Rename
          </div>
          <div class="context-menu-item" data-action="delete">
            <span>🗑️</span> Delete
          </div>
          <div class="context-menu-item" data-action="pin">
            <span>⭐</span> Pin / Unpin
          </div>
          <div class="context-menu-separator"></div>
          <div class="context-menu-item" data-action="new-note">
            <span>📝+</span> New Note Here
          </div>
          <div class="context-menu-item" data-action="new-folder">
            <span>📁+</span> New Folder Here
          </div>
          <div class="context-menu-separator"></div>
          <div class="context-menu-item" data-action="new-note-root">
            <span>📝</span> New Note (Root)
          </div>
          <div class="context-menu-item" data-action="new-folder-root">
            <span>📁</span> New Folder (Root)
          </div>
          <div class="context-menu-separator"></div>
          <div class="context-menu-item" data-action="refresh">
            <span>🔄</span> Refresh
          </div>
        </div>

        <!-- Template Picker Modal Overlay -->
        <div class="template-modal-overlay" id="template-modal-overlay" style="display: none;">
          <div class="template-modal">
            <div class="template-modal-header">
              <span>📋 Choose a Note Template</span>
              <button class="icon-btn" id="btn-template-close">✕</button>
            </div>
            <div class="template-list" id="template-list"></div>
          </div>
        </div>

        <!-- Confirmation Dialog -->
        <div class="dialog-overlay" id="dialog-overlay" style="display: none;">
          <div class="dialog">
            <p class="dialog-message" id="dialog-message"></p>
            <div class="dialog-actions">
              <button class="secondary-btn" id="dialog-cancel">Cancel</button>
              <button class="danger-btn" id="dialog-confirm">Delete</button>
            </div>
          </div>
        </div>

        <!-- Input Dialog (Templates & Modals) -->
        <div class="dialog-overlay" id="input-dialog-overlay" style="display: none;">
          <div class="dialog">
            <p class="dialog-message" id="input-dialog-title" style="margin-bottom: 8px; font-weight: 600;"></p>
            <input type="text" class="inline-input" id="input-dialog-field" style="margin-bottom: 12px; width: 100%; box-sizing: border-box;" autocomplete="off" />
            <div class="dialog-actions">
              <button class="secondary-btn" id="input-dialog-cancel">Cancel</button>
              <button class="primary-btn" id="input-dialog-confirm">OK</button>
            </div>
          </div>
        </div>

        <script nonce="${nonce}" src="${scriptUri}"></script>
      </body>
      </html>
    `;
  }
}

/**
 * Generate a nonce for Content Security Policy.
 */
function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
