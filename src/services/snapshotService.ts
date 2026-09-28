/**
 * SnapshotService — Captures, verifies, and navigates Code Snapshots.
 * Allows notes to reference live code with drift detection and jump-to-source.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { CodeSnapshot } from '../models/types';
import { ConfigService } from './configService';
import { toISOString } from '../utils/dateUtils';

export interface DriftCheckResult {
  hasDrifted: boolean;
  status: 'perfect' | 'shifted' | 'modified' | 'missing';
  currentCode?: string;
  startLine: number;
  endLine: number;
  message: string;
}

export class SnapshotService {
  /** Last active code editor that had focus */
  private lastActiveEditor?: vscode.TextEditor;
  /** Last active code document */
  private lastActiveDocument?: vscode.TextDocument;
  /** Last non-empty code selection */
  private lastActiveSelection?: vscode.Selection;

  constructor(
    private readonly workspacePath: string,
    private readonly configService: ConfigService
  ) {}

  /**
   * Register listeners to track the active code editor and selection even when
   * focus shifts into webviews or other panels.
   */
  registerListeners(context: vscode.ExtensionContext): void {
    // Immediately initialize with currently active editor if valid
    if (vscode.window.activeTextEditor && this.isValidCodeEditor(vscode.window.activeTextEditor)) {
      this.lastActiveEditor = vscode.window.activeTextEditor;
      this.lastActiveDocument = vscode.window.activeTextEditor.document;
      if (!vscode.window.activeTextEditor.selection.isEmpty) {
        this.lastActiveSelection = vscode.window.activeTextEditor.selection;
      }
    } else if (vscode.window.visibleTextEditors.length > 0) {
      const firstValid = vscode.window.visibleTextEditors.find((e) => this.isValidCodeEditor(e));
      if (firstValid) {
        this.lastActiveEditor = firstValid;
        this.lastActiveDocument = firstValid.document;
        if (!firstValid.selection.isEmpty) {
          this.lastActiveSelection = firstValid.selection;
        }
      }
    }

    context.subscriptions.push(
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor && this.isValidCodeEditor(editor)) {
          this.lastActiveEditor = editor;
          this.lastActiveDocument = editor.document;
          if (!editor.selection.isEmpty) {
            this.lastActiveSelection = editor.selection;
          }
        }
      }),

      vscode.window.onDidChangeTextEditorSelection((e) => {
        if (e.textEditor && this.isValidCodeEditor(e.textEditor)) {
          this.lastActiveEditor = e.textEditor;
          this.lastActiveDocument = e.textEditor.document;
          if (e.selections && e.selections.length > 0) {
            this.lastActiveSelection = e.selections[0];
          }
        }
      })
    );
  }

  /**
   * Check whether a text editor is a valid code editor (not a NotePad note or virtual document).
   */
  private isValidCodeEditor(editor: vscode.TextEditor): boolean {
    const doc = editor.document;
    if (doc.uri.scheme !== 'file') {
      return false;
    }
    const fsPath = doc.uri.fsPath.replace(/\\/g, '/');
    if (fsPath.includes('/.notes/') || fsPath.endsWith('/.notesconfig.json')) {
      return false;
    }
    return true;
  }

  /**
   * Capture a code snapshot from the active or visible/last code editor.
   */
  async captureActiveSelection(noteFile: string): Promise<CodeSnapshot | null> {
    // 1. Try currently active text editor
    let targetEditor: vscode.TextEditor | undefined;
    let targetDoc: vscode.TextDocument | undefined;
    let targetSelection: vscode.Selection | undefined;

    if (vscode.window.activeTextEditor && this.isValidCodeEditor(vscode.window.activeTextEditor)) {
      targetEditor = vscode.window.activeTextEditor;
      targetDoc = targetEditor.document;
      targetSelection = targetEditor.selection;
    }

    // 2. If no active editor with selection, search visible text editors (e.g. split editor)
    if (!targetSelection || targetSelection.isEmpty) {
      const visibleCodeEditors = vscode.window.visibleTextEditors.filter((e) => this.isValidCodeEditor(e));
      // First look for any visible editor with a non-empty selection
      const editorWithSelection = visibleCodeEditors.find((e) => !e.selection.isEmpty);
      if (editorWithSelection) {
        targetEditor = editorWithSelection;
        targetDoc = editorWithSelection.document;
        targetSelection = editorWithSelection.selection;
      } else if (visibleCodeEditors.length > 0) {
        // If one of the visible editors was the last active one
        const match = visibleCodeEditors.find((e) => e.document === this.lastActiveDocument);
        targetEditor = match || visibleCodeEditors[0];
        targetDoc = targetEditor.document;
        targetSelection = (match && this.lastActiveSelection) || targetEditor.selection;
      }
    }

    // 3. Fallback to last active document and selection
    if ((!targetSelection || targetSelection.isEmpty) && this.lastActiveDocument) {
      targetDoc = this.lastActiveDocument;
      targetSelection = this.lastActiveSelection;
    }

    // 4. Fallback to any open text document in workspace that is a code file
    if (!targetDoc) {
      const candidateDoc = vscode.workspace.textDocuments.find((d) => {
        if (d.uri.scheme !== 'file') return false;
        const p = d.uri.fsPath.replace(/\\/g, '/');
        return !p.includes('/.notes/') && !p.endsWith('/.notesconfig.json');
      });
      if (candidateDoc) {
        targetDoc = candidateDoc;
      }
    }

    if (!targetDoc) {
      vscode.window.showWarningMessage('NotePad: No active code editor to capture from. Please open a code file.');
      return null;
    }

    const sourceFile = path.relative(this.workspacePath, targetDoc.uri.fsPath).replace(/\\/g, '/');

    let startLine: number;
    let endLine: number;
    let capturedCode: string;

    if (targetSelection && !targetSelection.isEmpty) {
      startLine = targetSelection.start.line + 1; // 1-indexed
      endLine = targetSelection.end.line + 1;     // 1-indexed

      // In VSCode, if a selection ends at column 0 on the next line, that line wasn't part of the intended selection
      if (targetSelection.end.character === 0 && targetSelection.end.line > targetSelection.start.line) {
        endLine = targetSelection.end.line;
      }

      capturedCode = targetDoc.getText(targetSelection).replace(/\r\n/g, '\n');
    } else if (targetSelection) {
      // Cursor is on a line (empty selection) -> snapshot current line
      const activeLine = targetSelection.active.line;
      startLine = activeLine + 1;
      endLine = activeLine + 1;
      capturedCode = targetDoc.lineAt(activeLine).text.replace(/\r\n/g, '\n');
    } else {
      // Fallback: take line 1
      startLine = 1;
      endLine = Math.min(targetDoc.lineCount, 5);
      capturedCode = targetDoc.getText(new vscode.Range(0, 0, endLine - 1, targetDoc.lineAt(endLine - 1).text.length)).replace(/\r\n/g, '\n');
    }

    if (!capturedCode.trim()) {
      vscode.window.showWarningMessage('NotePad: The selected line or block has no code.');
      return null;
    }

    // Compute hash of the captured code
    const sourceHash = this.computeHash(capturedCode);
    const id = `snap_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const snapshot: CodeSnapshot = {
      id,
      noteFile,
      sourceFile,
      startLine,
      endLine,
      capturedCode,
      capturedAt: toISOString(),
      sourceHash,
    };

    // Save in config
    await this.configService.addSnapshot(snapshot);
    return snapshot;
  }

  /**
   * Jump to the source file and line referenced by a snapshot.
   * Dynamically resolves the live line range if lines shifted in the source file.
   */
  async jumpToSource(snapshotId: string): Promise<boolean> {
    const snapshot = await this.configService.getSnapshot(snapshotId);
    if (!snapshot) {
      vscode.window.showErrorMessage(`NotePad: Snapshot "${snapshotId}" not found.`);
      return false;
    }

    const absolutePath = this.resolveAbsolutePath(snapshot.sourceFile);
    if (!fs.existsSync(absolutePath)) {
      vscode.window.showErrorMessage(`NotePad: Source file "${snapshot.sourceFile}" does not exist.`);
      return false;
    }

    // Resolve live line range if code shifted
    const liveRange = await this.resolveLiveSnapshot(snapshot);

    const document = await vscode.workspace.openTextDocument(absolutePath);
    const editor = await vscode.window.showTextDocument(document, {
      viewColumn: vscode.ViewColumn.Beside,
      preserveFocus: false,
    });

    // Reveal and select the live lines
    const startLineIdx = Math.max(0, liveRange.startLine - 1);
    const endLineIdx = Math.min(document.lineCount - 1, Math.max(0, liveRange.endLine - 1));
    const startPos = new vscode.Position(startLineIdx, 0);
    const endPos = new vscode.Position(endLineIdx, document.lineAt(endLineIdx).text.length);

    editor.selection = new vscode.Selection(startPos, endPos);
    editor.revealRange(
      new vscode.Range(startPos, endPos),
      vscode.TextEditorRevealType.InCenter
    );

    return true;
  }

  /**
   * Check if the source code has drifted / changed since the snapshot was taken.
   * Accurately tracks live line ranges when lines shift, detects modifications, and
   * checks against live unsaved VSCode buffers if available.
   */
  async checkCodeDrift(snapshotId: string): Promise<DriftCheckResult> {
    const snapshot = await this.configService.getSnapshot(snapshotId);
    if (!snapshot) {
      return {
        hasDrifted: false,
        status: 'missing',
        startLine: 1,
        endLine: 1,
        message: 'Snapshot not found in notes configuration.',
      };
    }

    return this.resolveLiveSnapshot(snapshot);
  }

  /**
   * Update snapshot with current source code from the live source file.
   */
  async updateSnapshotFromSource(snapshotId: string): Promise<CodeSnapshot | null> {
    const snapshot = await this.configService.getSnapshot(snapshotId);
    if (!snapshot) return null;

    const absolutePath = this.resolveAbsolutePath(snapshot.sourceFile);
    const liveContent = this.getLiveFileText(absolutePath);
    if (!liveContent) {
      throw new Error(`Source file ${snapshot.sourceFile} does not exist`);
    }

    const liveRange = await this.resolveLiveSnapshot(snapshot);
    const lines = liveContent.split('\n');
    const startIdx = Math.max(0, liveRange.startLine - 1);
    const endIdx = Math.min(lines.length, liveRange.endLine);
    const currentLines = lines.slice(startIdx, endIdx);
    const capturedCode = currentLines.join('\n');

    snapshot.startLine = liveRange.startLine;
    snapshot.endLine = liveRange.endLine;
    snapshot.capturedCode = capturedCode;
    snapshot.sourceHash = this.computeHash(capturedCode);
    snapshot.capturedAt = toISOString();

    await this.configService.addSnapshot(snapshot);
    return snapshot;
  }

  /**
   * Resolves live line ranges and drift status for all snapshots belonging to a note.
   */
  async resolveSnapshotsForNote(
    snapshots: Record<string, CodeSnapshot>
  ): Promise<Record<string, CodeSnapshot>> {
    for (const snap of Object.values(snapshots)) {
      const live = await this.resolveLiveSnapshot(snap);
      if (live.status === 'shifted' && (snap.startLine !== live.startLine || snap.endLine !== live.endLine)) {
        snap.startLine = live.startLine;
        snap.endLine = live.endLine;
        await this.configService.addSnapshot(snap);
      }
    }
    return snapshots;
  }

  /**
   * Core algorithm: resolves live line range and change detection.
   * Handles:
   * 1. Exact match at original line range.
   * 2. Shifted line range (code moved intact due to edits elsewhere in file).
   * 3. Drifted / modified code (locating best anchor match).
   * 4. Missing file.
   */
  private async resolveLiveSnapshot(snapshot: CodeSnapshot): Promise<DriftCheckResult> {
    const absolutePath = this.resolveAbsolutePath(snapshot.sourceFile);
    const liveText = this.getLiveFileText(absolutePath);

    if (liveText === null) {
      return {
        hasDrifted: true,
        status: 'missing',
        startLine: snapshot.startLine,
        endLine: snapshot.endLine,
        message: `Source file "${snapshot.sourceFile}" deleted or missing`,
      };
    }

    const fileLines = liveText.split('\n');
    const capturedCodeNorm = snapshot.capturedCode.replace(/\r\n/g, '\n').trim();
    const capturedLines = capturedCodeNorm.split('\n');
    const capturedHash = snapshot.sourceHash || this.computeHash(snapshot.capturedCode);

    // ── Check 1: Check recorded line range ────────────────────────
    const sLine = Math.max(1, snapshot.startLine);
    const eLine = Math.min(fileLines.length, Math.max(sLine, snapshot.endLine));
    if (sLine <= fileLines.length) {
      const currentRangeLines = fileLines.slice(sLine - 1, eLine);
      const currentRangeText = currentRangeLines.join('\n');
      const currentHash = this.computeHash(currentRangeText);

      // Match via hash, exact text, or substring (single-line snippet within full line)
      if (
        currentHash === capturedHash ||
        currentRangeText.trim() === capturedCodeNorm ||
        (sLine === eLine && currentRangeText.includes(capturedCodeNorm))
      ) {
        return {
          hasDrifted: false,
          status: 'perfect',
          currentCode: currentRangeText,
          startLine: sLine,
          endLine: eLine,
          message: `Code matches source file (L${sLine}-L${eLine})`,
        };
      }
    }

    // ── Check 2: Shifted Search (Find exact captured code elsewhere)
    const shiftedRange = this.findCodeInLines(fileLines, capturedLines, snapshot.startLine);
    if (shiftedRange) {
      const { startLine: newStart, endLine: newEnd } = shiftedRange;
      const shiftedText = fileLines.slice(newStart - 1, newEnd).join('\n');

      // Update snapshot line range in configuration since code is intact
      if (newStart !== snapshot.startLine || newEnd !== snapshot.endLine) {
        snapshot.startLine = newStart;
        snapshot.endLine = newEnd;
        await this.configService.addSnapshot(snapshot);
      }

      return {
        hasDrifted: false,
        status: 'shifted',
        currentCode: shiftedText,
        startLine: newStart,
        endLine: newEnd,
        message: `Line range shifted to L${newStart}-L${newEnd} (code intact)`,
      };
    }

    // ── Check 3: Code Modified (Anchor-based range detection) ────
    const anchorRange = this.findAnchorRange(fileLines, capturedLines, snapshot.startLine, snapshot.endLine);
    const candStart = anchorRange ? anchorRange.startLine : sLine;
    const candEnd = anchorRange ? anchorRange.endLine : eLine;
    const currentCode = fileLines.slice(candStart - 1, candEnd).join('\n');

    return {
      hasDrifted: true,
      status: 'modified',
      currentCode,
      startLine: candStart,
      endLine: candEnd,
      message: `Code changed in source file (current range: L${candStart}-L${candEnd})`,
    };
  }

  /**
   * Search for exact block of lines in file, returning closest match to preferredLine.
   */
  private findCodeInLines(
    fileLines: string[],
    targetLines: string[],
    preferredLine: number
  ): { startLine: number; endLine: number } | null {
    if (targetLines.length === 0 || fileLines.length < targetLines.length) {
      return null;
    }

    const trimmedTargets = targetLines.map((l) => l.trim());
    const matches: Array<{ startLine: number; endLine: number; distance: number }> = [];

    for (let i = 0; i <= fileLines.length - targetLines.length; i++) {
      let match = true;
      for (let j = 0; j < targetLines.length; j++) {
        if (fileLines[i + j].trim() !== trimmedTargets[j]) {
          match = false;
          break;
        }
      }

      if (match) {
        const startLine = i + 1;
        const endLine = i + targetLines.length;
        matches.push({
          startLine,
          endLine,
          distance: Math.abs(startLine - preferredLine),
        });
      }
    }

    if (matches.length === 0) return null;

    // Sort by proximity to original start line
    matches.sort((a, b) => a.distance - b.distance);
    return { startLine: matches[0].startLine, endLine: matches[0].endLine };
  }

  /**
   * Search for the best candidate line range using anchor lines (first/last significant lines)
   * when code inside the snapshot has been modified.
   */
  private findAnchorRange(
    fileLines: string[],
    targetLines: string[],
    origStart: number,
    origEnd: number
  ): { startLine: number; endLine: number } | null {
    // Find first significant non-empty anchor line
    const anchorLine = targetLines.find((l) => l.trim().length >= 4);
    if (!anchorLine) return null;

    const trimmedAnchor = anchorLine.trim();
    let bestLineIdx = -1;
    let minDistance = Infinity;

    for (let i = 0; i < fileLines.length; i++) {
      if (fileLines[i].trim() === trimmedAnchor || fileLines[i].includes(trimmedAnchor)) {
        const dist = Math.abs(i + 1 - origStart);
        if (dist < minDistance) {
          minDistance = dist;
          bestLineIdx = i;
        }
      }
    }

    if (bestLineIdx !== -1) {
      const startLine = bestLineIdx + 1;
      const endLine = Math.min(fileLines.length, startLine + targetLines.length - 1);
      return { startLine, endLine };
    }

    return null;
  }

  /**
   * Read file content from open live VSCode buffer if available, or disk.
   */
  private getLiveFileText(absolutePath: string): string | null {
    // 1. Check open text documents in VSCode for live in-memory changes
    const normTarget = path.normalize(absolutePath).toLowerCase();
    const openDoc = vscode.workspace.textDocuments.find(
      (d) => path.normalize(d.uri.fsPath).toLowerCase() === normTarget
    );
    if (openDoc) {
      return openDoc.getText().replace(/\r\n/g, '\n');
    }

    // 2. Read from filesystem
    if (fs.existsSync(absolutePath)) {
      try {
        return fs.readFileSync(absolutePath, 'utf-8').replace(/\r\n/g, '\n');
      } catch {
        return null;
      }
    }

    return null;
  }

  /**
   * Resolve sourceFile path to absolute path.
   */
  private resolveAbsolutePath(sourceFile: string): string {
    if (path.isAbsolute(sourceFile)) {
      return sourceFile;
    }
    return path.join(this.workspacePath, sourceFile);
  }

  /**
   * Delete snapshot by ID.
   */
  async deleteSnapshot(snapshotId: string): Promise<void> {
    await this.configService.removeSnapshot(snapshotId);
  }

  /**
   * Hash code content stably, ignoring CRLF variations and trimming whitespace.
   */
  computeHash(content: string): string {
    const normalized = content.replace(/\r\n/g, '\n').trim();
    return crypto.createHash('sha256').update(normalized).digest('hex').substring(0, 16);
  }
}

