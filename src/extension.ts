/**
 * Extension Entry Point — activate() and deactivate().
 * Registers all providers, commands, file watchers, and event listeners.
 */

import * as vscode from 'vscode';
import { SidebarProvider } from './providers/sidebarProvider';
import { NoteEditorProvider } from './providers/noteEditorProvider';
import { StorageService } from './services/storageService';
import { ConfigService } from './services/configService';
import { TemplateService } from './services/templateService';
import { SnapshotService } from './services/snapshotService';
import { TagService } from './services/tagService';
import { SearchService } from './services/searchService';
import { TimelineService } from './services/timelineService';
import { UpdateService } from './services/updateService';
import { MessageHandler } from './handlers/messageHandler';
import { COMMANDS } from './models/constants';
import { toISOString } from './utils/dateUtils';
import { getCurrentBranch } from './utils/gitUtils';

let sidebarProvider: SidebarProvider;
let noteEditorProvider: NoteEditorProvider;
let storageService: StorageService;
let configService: ConfigService;
let templateService: TemplateService;
let snapshotService: SnapshotService;
let tagService: TagService;
let searchService: SearchService;
let timelineService: TimelineService;
let updateService: UpdateService;
let focusModeTimer: NodeJS.Timeout | null = null;

export async function activate(context: vscode.ExtensionContext) {
  console.log('[NotePad] Extension activating...');

  // ─── Initialize Update Service ───────────────────────────
  const currentVersion = context.extension?.packageJSON?.version || '0.1.0';
  updateService = new UpdateService(currentVersion);

  context.subscriptions.push(
    vscode.commands.registerCommand(COMMANDS.CHECK_FOR_UPDATES, () => {
      updateService.checkForUpdates(true);
    })
  );

  // Background update check on startup (delayed 4 seconds)
  const autoCheck = vscode.workspace.getConfiguration('notepad').get<boolean>('autoCheckUpdates', true);
  if (autoCheck) {
    setTimeout(() => {
      updateService.checkForUpdates(false).catch(() => {});
    }, 4000);
  }

  // ─── Guard: Require a workspace ──────────────────────────
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showInformationMessage(
      'NotePad: Open a folder or workspace to start taking notes.'
    );
    return;
  }

  const workspacePath = workspaceFolder.uri.fsPath;

  // ─── Initialize Services ─────────────────────────────────
  storageService = new StorageService(workspacePath);
  configService = new ConfigService(workspacePath);
  templateService = new TemplateService(context.extensionUri, workspacePath, configService);
  snapshotService = new SnapshotService(workspacePath, configService);
  snapshotService.registerListeners(context);
  tagService = new TagService(configService, storageService);
  searchService = new SearchService(storageService);
  timelineService = new TimelineService(storageService, configService);

  // Ensure .notes/ directory exists and config is loaded
  await storageService.ensureNotesDir();
  await configService.load();

  // Scan and reindex tags in background on activation
  tagService.reindexAllNotes().catch((err) => {
    console.error('[NotePad] Tag indexing error:', err);
  });

  // ─── Initialize Providers & Handlers ─────────────────────
  const messageHandler = new MessageHandler(
    storageService,
    configService,
    templateService,
    searchService,
    tagService,
    timelineService,
    workspacePath
  );

  noteEditorProvider = new NoteEditorProvider(
    context.extensionUri,
    storageService,
    configService,
    snapshotService,
    tagService
  );

  sidebarProvider = new SidebarProvider(context.extensionUri, messageHandler);

  // ─── Register Sidebar View Provider ──────────────────────
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      SidebarProvider.viewType,
      sidebarProvider,
      {
        webviewOptions: { retainContextWhenHidden: true },
      }
    )
  );

  // ─── Register Commands ───────────────────────────────────

  // 1. Create Folder
  context.subscriptions.push(
    vscode.commands.registerCommand(COMMANDS.CREATE_FOLDER, async () => {
      const name = await vscode.window.showInputBox({
        prompt: 'Enter folder name',
        placeHolder: 'My Notes',
        validateInput: (value) => {
          if (!value || value.trim().length === 0) {
            return 'Folder name cannot be empty';
          }
          return null;
        },
      });
      if (name) {
        try {
          await storageService.createFolder(name, '/');
          sidebarProvider.refresh();
          vscode.window.showInformationMessage(`📁 Folder "${name}" created`);
        } catch (error: any) {
          vscode.window.showErrorMessage(`NotePad: ${error.message}`);
        }
      }
    })
  );

  // 2. Create Note
  context.subscriptions.push(
    vscode.commands.registerCommand(COMMANDS.CREATE_NOTE, async () => {
      const name = await vscode.window.showInputBox({
        prompt: 'Enter note name',
        placeHolder: 'My Note',
        validateInput: (value) => {
          if (!value || value.trim().length === 0) {
            return 'Note name cannot be empty';
          }
          return null;
        },
      });
      if (name) {
        try {
          const notePath = await storageService.createNote(name, '/');
          const branch = await getCurrentBranch(workspacePath);
          await configService.setNoteMetadata(notePath, {
            createdAt: toISOString(),
            modifiedAt: toISOString(),
            branch: branch || undefined,
          });
          sidebarProvider.refresh();
          noteEditorProvider.openNote(notePath);
          vscode.window.showInformationMessage(`📝 Note "${name}" created`);
        } catch (error: any) {
          vscode.window.showErrorMessage(`NotePad: ${error.message}`);
        }
      }
    })
  );

  // 3. Create Note from Template
  context.subscriptions.push(
    vscode.commands.registerCommand(COMMANDS.CREATE_NOTE_FROM_TEMPLATE, async () => {
      try {
        const templates = await templateService.listTemplates();
        const pickItems = templates.map((t) => ({
          label: t.name,
          description: t.builtIn ? 'Built-in' : 'Custom',
          detail: t.description,
          id: t.id,
        }));

        const chosen = await vscode.window.showQuickPick(pickItems, {
          placeHolder: 'Choose a Note Template',
        });

        if (!chosen) return;

        const name = await vscode.window.showInputBox({
          prompt: `Enter note name for template "${chosen.label}"`,
          placeHolder: 'My New Note',
          validateInput: (val) => (val && val.trim() ? null : 'Note name is required'),
        });

        if (!name) return;

        const instantiated = await templateService.instantiateTemplate(chosen.id, name);
        const notePath = await storageService.createNote(name, '/', instantiated);
        const branch = await getCurrentBranch(workspacePath);

        await configService.setNoteMetadata(notePath, {
          createdAt: toISOString(),
          modifiedAt: toISOString(),
          branch: branch || undefined,
          templateUsed: chosen.id,
        });

        await tagService.updateNoteTags(notePath, instantiated);
        sidebarProvider.refresh();
        noteEditorProvider.openNote(notePath);
        vscode.window.showInformationMessage(`📋 Created note from template "${chosen.label}"`);
      } catch (error: any) {
        vscode.window.showErrorMessage(`NotePad: ${error.message}`);
      }
    })
  );

  // 4. Quick Capture (Ctrl+Shift+N)
  context.subscriptions.push(
    vscode.commands.registerCommand(COMMANDS.QUICK_CAPTURE, async () => {
      const thought = await vscode.window.showInputBox({
        prompt: '💡 Quick Capture — jot down a developer thought, bug idea, or reminder',
        placeHolder: 'e.g. Fix auth timeout on refresh token #urgent',
      });
      if (thought) {
        try {
          const quickFolder = vscode.workspace
            .getConfiguration('notepad')
            .get<string>('quickCaptureFolder', 'Quick Notes');

          try {
            await storageService.createFolder(quickFolder, '/');
          } catch {
            // Folder may exist
          }

          const now = new Date();
          const dateName = `${now.toISOString().slice(0, 10)}-${now.toTimeString().slice(0, 5).replace(':', '')}`;
          const notePath = await storageService.createNote(dateName, `/${quickFolder}`, `${thought}\n`);
          const branch = await getCurrentBranch(workspacePath);

          await configService.setNoteMetadata(notePath, {
            createdAt: toISOString(),
            modifiedAt: toISOString(),
            branch: branch || undefined,
          });

          await tagService.updateNoteTags(notePath, thought);
          sidebarProvider.refresh();
          vscode.window.showInformationMessage('⚡ Quick note captured!');
        } catch (error: any) {
          vscode.window.showErrorMessage(`NotePad: ${error.message}`);
        }
      }
    })
  );

  // 5. Search Notes
  context.subscriptions.push(
    vscode.commands.registerCommand(COMMANDS.SEARCH_NOTES, async () => {
      const query = await vscode.window.showInputBox({
        prompt: '🔍 Search in notes',
        placeHolder: 'Search titles and content...',
      });
      if (query) {
        const results = await searchService.search(query);
        if (results.length === 0) {
          vscode.window.showInformationMessage(`No notes found matching "${query}"`);
          return;
        }

        const items = results.map((r) => ({
          label: `📝 ${r.title}`,
          description: r.path,
          detail: r.snippet,
          path: r.path,
        }));

        const selected = await vscode.window.showQuickPick(items, {
          placeHolder: `Found ${results.length} matching note(s)`,
        });

        if (selected) {
          noteEditorProvider.openNote(selected.path);
        }
      }
    })
  );

  // 6. Insert Code Snapshot from Selection
  context.subscriptions.push(
    vscode.commands.registerCommand(COMMANDS.INSERT_SNAPSHOT, async () => {
      let targetNote: string | undefined = noteEditorProvider.getActiveOrVisibleNotePath() || undefined;
      if (!targetNote) {
        targetNote = await configService.getLastOpened();
      }

      if (!targetNote) {
        // Collect existing notes if no note was active
        const notes = await storageService.getTree();
        const flatNotes: { label: string; path: string }[] = [];
        const collectNotes = (nodes: import('./models/types').TreeNode[]) => {
          for (const n of nodes) {
            if (n.type === 'note') {
              flatNotes.push({ label: `📝 ${n.name}`, path: n.path });
            } else if (n.children) {
              collectNotes(n.children);
            }
          }
        };
        collectNotes(notes);

        if (flatNotes.length === 0) {
          const createChoice = await vscode.window.showInformationMessage(
            'NotePad: No notes exist yet. Create a note to attach this code snapshot?',
            'Create Note'
          );
          if (createChoice === 'Create Note') {
            await vscode.commands.executeCommand(COMMANDS.CREATE_NOTE);
          }
          return;
        }

        const picked = await vscode.window.showQuickPick(flatNotes, {
          placeHolder: 'Select a note to attach this code snapshot to:',
        });
        if (!picked) return;
        targetNote = picked.path;
      }

      const snapshot = await snapshotService.captureActiveSelection(targetNote);
      if (snapshot) {
        // Open and reveal the note editor so the user sees the captured snapshot right away
        await noteEditorProvider.openNote(targetNote);
        noteEditorProvider.insertSnapshot(targetNote, snapshot);
        vscode.window.showInformationMessage(
          `📸 Code snapshot captured (${snapshot.sourceFile}: L${snapshot.startLine}-L${snapshot.endLine})!`
        );
      }
    })
  );

  // 7. Filter Notes by Tag
  context.subscriptions.push(
    vscode.commands.registerCommand(COMMANDS.FILTER_BY_TAG, async () => {
      const allTags = await configService.getTags();
      const tagEntries = Object.entries(allTags);

      if (tagEntries.length === 0) {
        vscode.window.showInformationMessage('NotePad: No tags found in your notes yet. Use #tags in your notes!');
        return;
      }

      const items = tagEntries.map(([tag, paths]) => ({
        label: `🏷️ ${tag}`,
        description: `${paths.length} note(s)`,
        tag,
        paths,
      }));

      const chosen = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a tag to view notes',
      });

      if (chosen) {
        const noteItems = chosen.paths.map((p) => ({
          label: `📝 ${p.split('/').pop()?.replace(/\.(md|txt)$/, '')}`,
          description: p,
          path: p,
        }));

        const selectedNote = await vscode.window.showQuickPick(noteItems, {
          placeHolder: `Notes tagged with ${chosen.tag}`,
        });

        if (selectedNote) {
          noteEditorProvider.openNote(selectedNote.path);
        }
      }
    })
  );

  // 8. Focus Mode / Pomodoro Timer
  context.subscriptions.push(
    vscode.commands.registerCommand(COMMANDS.FOCUS_MODE, async () => {
      if (focusModeTimer) {
        clearTimeout(focusModeTimer);
        focusModeTimer = null;
        vscode.window.showInformationMessage('🧘 Focus Mode exited.');
      } else {
        const minutes = 25;
        vscode.window.showInformationMessage(`🧘 Focus Mode activated — 25 min Pomodoro started. Stay focused!`);
        focusModeTimer = setTimeout(() => {
          vscode.window.showInformationMessage("⏰ Focus session complete! Time to take a 5-minute break.");
          focusModeTimer = null;
        }, minutes * 60 * 1000);
      }
    })
  );

  // 9. Pin Item
  context.subscriptions.push(
    vscode.commands.registerCommand(COMMANDS.PIN_ITEM, async () => {
      const lastOpened = await configService.getLastOpened();
      if (lastOpened) {
        const isPinned = await configService.togglePin(lastOpened);
        sidebarProvider.refresh();
        vscode.window.showInformationMessage(
          isPinned ? `⭐ Pinned "${lastOpened}"` : `Unpinned "${lastOpened}"`
        );
      }
    })
  );

  // 10. Refresh Explorer
  context.subscriptions.push(
    vscode.commands.registerCommand(COMMANDS.REFRESH_EXPLORER, () => {
      sidebarProvider.refresh();
    })
  );

  // 11. Internal command: Open note (triggered by sidebar webview)
  context.subscriptions.push(
    vscode.commands.registerCommand('notepad._internal.openNote', (notePath: string) => {
      noteEditorProvider.openNote(notePath);
    })
  );

  // ─── File System Watcher ─────────────────────────────────
  const notesPattern = new vscode.RelativePattern(
    vscode.Uri.file(storageService.getNotesDir()),
    '**/*'
  );

  const watcher = vscode.workspace.createFileSystemWatcher(notesPattern);

  watcher.onDidCreate(() => sidebarProvider.refresh());
  watcher.onDidDelete(() => sidebarProvider.refresh());
  watcher.onDidChange(() => sidebarProvider.refresh());

  context.subscriptions.push(watcher);

  // ─── Offer to add .notes to .gitignore ────────────────────
  offerGitignoreUpdate(workspacePath);

  console.log('[NotePad] Extension activated successfully!');
}

export function deactivate() {
  if (focusModeTimer) {
    clearTimeout(focusModeTimer);
    focusModeTimer = null;
  }
  console.log('[NotePad] Extension deactivated.');
}

// ─── Helpers ──────────────────────────────────────────────────

/**
 * Offer to add .notes/ to .gitignore if it's not already there.
 */
async function offerGitignoreUpdate(workspacePath: string) {
  const path = require('path');
  const fs = require('fs');

  const gitignorePath = path.join(workspacePath, '.gitignore');

  try {
    if (fs.existsSync(gitignorePath)) {
      const content = fs.readFileSync(gitignorePath, 'utf-8');
      if (!content.includes('.notes')) {
        const answer = await vscode.window.showInformationMessage(
          'NotePad: Add ".notes/" to .gitignore?',
          'Yes',
          'No'
        );
        if (answer === 'Yes') {
          fs.appendFileSync(gitignorePath, '\n# NotePad extension data\n.notes/\n');
          vscode.window.showInformationMessage('✅ Added .notes/ to .gitignore');
        }
      }
    }
  } catch {
    // Silently fail — not critical
  }
}
