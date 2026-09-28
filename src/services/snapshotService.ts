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

export class SnapshotService {
  constructor(
    private readonly workspacePath: string,
    private readonly configService: ConfigService
  ) {}

  /**
   * Capture a code snapshot from the active text editor.
   */
  async captureActiveSelection(noteFile: string): Promise<CodeSnapshot | null> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage('NotePad: No active code editor to capture from.');
      return null;
    }

    const document = editor.document;
    const selection = editor.selection;

    if (selection.isEmpty) {
      vscode.window.showWarningMessage('NotePad: Please select the code you want to snapshot.');
      return null;
    }

    const sourceFile = path.relative(this.workspacePath, document.uri.fsPath).replace(/\\/g, '/');
    const startLine = selection.start.line + 1; // 1-indexed
    const endLine = selection.end.line + 1;     // 1-indexed
    const capturedCode = document.getText(selection);

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
   */
  async jumpToSource(snapshotId: string): Promise<boolean> {
    const snapshot = await this.configService.getSnapshot(snapshotId);
    if (!snapshot) {
      vscode.window.showErrorMessage(`NotePad: Snapshot "${snapshotId}" not found.`);
      return false;
    }

    const absolutePath = path.isAbsolute(snapshot.sourceFile)
      ? snapshot.sourceFile
      : path.join(this.workspacePath, snapshot.sourceFile);

    if (!fs.existsSync(absolutePath)) {
      vscode.window.showErrorMessage(`NotePad: Source file "${snapshot.sourceFile}" does not exist.`);
      return false;
    }

    const document = await vscode.workspace.openTextDocument(absolutePath);
    const editor = await vscode.window.showTextDocument(document, {
      viewColumn: vscode.ViewColumn.Beside,
      preserveFocus: false,
    });

    // Reveal and select the lines
    const startPos = new vscode.Position(Math.max(0, snapshot.startLine - 1), 0);
    const endPos = new vscode.Position(Math.max(0, snapshot.endLine - 1), document.lineAt(Math.min(snapshot.endLine - 1, document.lineCount - 1)).text.length);

    editor.selection = new vscode.Selection(startPos, endPos);
    editor.revealRange(
      new vscode.Range(startPos, endPos),
      vscode.TextEditorRevealType.InCenter
    );

    return true;
  }

  /**
   * Check if the source code has drifted / changed since the snapshot was taken.
   */
  async checkCodeDrift(snapshotId: string): Promise<{ hasDrifted: boolean; currentCode?: string; message?: string }> {
    const snapshot = await this.configService.getSnapshot(snapshotId);
    if (!snapshot) {
      return { hasDrifted: false, message: 'Snapshot not found' };
    }

    const absolutePath = path.isAbsolute(snapshot.sourceFile)
      ? snapshot.sourceFile
      : path.join(this.workspacePath, snapshot.sourceFile);

    if (!fs.existsSync(absolutePath)) {
      return { hasDrifted: true, message: 'Source file deleted or moved' };
    }

    try {
      const fileContent = fs.readFileSync(absolutePath, 'utf-8');
      const lines = fileContent.split(/\r?\n/);
      
      if (snapshot.startLine > lines.length) {
        return { hasDrifted: true, message: 'Source file lines shortened' };
      }

      const currentLines = lines.slice(snapshot.startLine - 1, snapshot.endLine);
      const currentCode = currentLines.join('\n');
      const currentHash = this.computeHash(currentCode);

      const hasDrifted = currentHash !== snapshot.sourceHash;
      return { hasDrifted, currentCode };
    } catch (err: any) {
      return { hasDrifted: true, message: err.message };
    }
  }

  /**
   * Update snapshot with current source code from file.
   */
  async updateSnapshotFromSource(snapshotId: string): Promise<CodeSnapshot | null> {
    const snapshot = await this.configService.getSnapshot(snapshotId);
    if (!snapshot) return null;

    const absolutePath = path.isAbsolute(snapshot.sourceFile)
      ? snapshot.sourceFile
      : path.join(this.workspacePath, snapshot.sourceFile);

    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Source file ${snapshot.sourceFile} does not exist`);
    }

    const fileContent = fs.readFileSync(absolutePath, 'utf-8');
    const lines = fileContent.split(/\r?\n/);
    const currentLines = lines.slice(snapshot.startLine - 1, snapshot.endLine);
    const capturedCode = currentLines.join('\n');

    snapshot.capturedCode = capturedCode;
    snapshot.sourceHash = this.computeHash(capturedCode);
    snapshot.capturedAt = toISOString();

    await this.configService.addSnapshot(snapshot);
    return snapshot;
  }

  /**
   * Delete snapshot by ID.
   */
  async deleteSnapshot(snapshotId: string): Promise<void> {
    await this.configService.removeSnapshot(snapshotId);
  }

  private computeHash(content: string): string {
    return crypto.createHash('sha256').update(content.trim()).digest('hex').substring(0, 16);
  }
}
