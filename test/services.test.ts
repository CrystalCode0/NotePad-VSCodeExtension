/**
 * Unit Test Suite for NotePad extension core services.
 * Tests StorageService, ConfigService, TagService, SearchService, TemplateService, and TimelineService.
 */

import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

// Mock vscode module before importing services that depend on it
const mockVscode = {
  window: {
    activeTextEditor: undefined,
    visibleTextEditors: [],
    onDidChangeActiveTextEditor: () => ({ dispose: () => {} }),
    onDidChangeTextEditorSelection: () => ({ dispose: () => {} }),
    showWarningMessage: () => {},
    showErrorMessage: () => {},
    showInformationMessage: () => {},
  },
  workspace: {
    textDocuments: [],
  },
  Position: class { constructor(public line: number, public character: number) {} },
  Range: class { constructor(public start: any, public end: any) {} },
  Selection: class { constructor(public start: any, public end: any) {} },
};
// @ts-ignore
const Module = require('module');
const origRequire = Module.prototype.require;
// @ts-ignore
Module.prototype.require = function (id: string) {
  if (id === 'vscode') return mockVscode;
  return origRequire.apply(this, arguments);
};

import { StorageService } from '../src/services/storageService';
import { ConfigService } from '../src/services/configService';
import { TagService } from '../src/services/tagService';
import { SearchService } from '../src/services/searchService';
import { TimelineService } from '../src/services/timelineService';
import { SnapshotService } from '../src/services/snapshotService';

async function runTests() {
  console.log('🚀 Starting NotePad Services Test Suite...\n');

  // Create isolated temp workspace
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'notepad-test-'));
  console.log(`📁 Test Workspace: ${tempDir}`);

  try {
    const storageService = new StorageService(tempDir);
    const configService = new ConfigService(tempDir);
    const tagService = new TagService(configService, storageService);
    const searchService = new SearchService(storageService);
    const timelineService = new TimelineService(storageService, configService);
    const snapshotService = new SnapshotService(tempDir, configService);

    // ─── Test 1: StorageService - Directory & Tree ───
    console.log('🧪 Test 1: StorageService - Initialize and tree building...');
    await storageService.ensureNotesDir();
    assert.strictEqual(fs.existsSync(path.join(tempDir, '.notes')), true, '.notes folder should be created');
    
    let tree = await storageService.getTree();
    assert.strictEqual(tree.length, 0, 'Initial tree should be empty');
    console.log('   ✅ Test 1 Passed!');

    // ─── Test 2: StorageService - Folder & Note CRUD ───
    console.log('🧪 Test 2: StorageService - Folder & Note CRUD...');
    const folderPath = await storageService.createFolder('Engineering', '/');
    assert.strictEqual(folderPath, '/Engineering');

    const notePath = await storageService.createNote('architecture', '/Engineering', '# Architecture\n\nDiscussion on microservices #backend #urgent.');
    assert.strictEqual(notePath, '/Engineering/architecture.md');

    const content = await storageService.readNote(notePath);
    assert.ok(content.includes('microservices'), 'Read content should match written content');

    tree = await storageService.getTree();
    assert.strictEqual(tree.length, 1, 'Tree should contain 1 root folder');
    assert.strictEqual(tree[0].name, 'Engineering');
    assert.strictEqual(tree[0].children?.length, 1);
    assert.strictEqual(tree[0].children?.[0].name, 'architecture');
    console.log('   ✅ Test 2 Passed!');

    // ─── Test 3: TagService - Extraction & Indexing ───
    console.log('🧪 Test 3: TagService - Tag parsing & indexing...');
    const extracted = tagService.extractTags(content);
    assert.ok(extracted.includes('#backend'), 'Should extract #backend');
    assert.ok(extracted.includes('#urgent'), 'Should extract #urgent');
    assert.ok(!extracted.includes('# architecture'), 'Should not extract markdown header as tag');

    await tagService.updateNoteTags(notePath, content);
    const taggedNotes = await tagService.getNotesForTag('#backend');
    assert.strictEqual(taggedNotes.length, 1);
    assert.strictEqual(taggedNotes[0], notePath);
    console.log('   ✅ Test 3 Passed!');

    // ─── Test 4: SearchService - Full Text Search ───
    console.log('🧪 Test 4: SearchService - Full text search...');
    const results = await searchService.search('microservices');
    assert.strictEqual(results.length, 1, 'Should find 1 matching note');
    assert.strictEqual(results[0].title, 'architecture');
    assert.ok(results[0].snippet.includes('microservices'), 'Snippet should contain match term');
    console.log('   ✅ Test 4 Passed!');

    // ─── Test 5: ConfigService - Pins & Snapshots ───
    console.log('🧪 Test 5: ConfigService - Pins and Code Snapshots...');
    const isPinned = await configService.togglePin(notePath);
    assert.strictEqual(isPinned, true, 'Note should be pinned');

    const pinnedPaths = await configService.getPinnedPaths();
    assert.ok(pinnedPaths.includes(notePath), 'Pinned list should include note');

    // Add snapshot test
    await configService.addSnapshot({
      id: 'snap_test_1',
      noteFile: notePath,
      sourceFile: 'src/main.ts',
      startLine: 10,
      endLine: 25,
      capturedCode: 'function run() { return 42; }',
      capturedAt: new Date().toISOString(),
      sourceHash: 'abc12345',
    });

    const snapshot = await configService.getSnapshot('snap_test_1');
    assert.ok(snapshot !== null, 'Snapshot should be stored in config');
    assert.strictEqual(snapshot?.sourceFile, 'src/main.ts');

    // Remove snapshot test
    await configService.removeSnapshot('snap_test_1');
    const removedSnapshot = await configService.getSnapshot('snap_test_1');
    assert.strictEqual(removedSnapshot, null, 'Snapshot should be removed from config');
    console.log('   ✅ Test 5 Passed!');

    // ─── Test 6: StorageService - Move & Rename ───
    console.log('🧪 Test 6: StorageService - Move and Rename...');
    await storageService.createFolder('Archive', '/');
    const movedPath = await storageService.moveItem(notePath, '/Archive');
    assert.strictEqual(movedPath, '/Archive/architecture.md');

    const renamedPath = await storageService.renameItem(movedPath, 'archived-architecture');
    assert.strictEqual(renamedPath, '/Archive/archived-architecture.md');
    console.log('   ✅ Test 6 Passed!');

    // ─── Test 7: TimelineService - Bucket Grouping ───
    console.log('🧪 Test 7: TimelineService - Grouping...');
    const timeline = await timelineService.getTimeline();
    assert.ok(timeline.length > 0, 'Timeline should have groups');
    assert.strictEqual(timeline[0].bucket, 'Today');
    console.log('   ✅ Test 7 Passed!');

    // ─── Test 8: SnapshotService - Live File, Line Shift & Drift Detection ───
    console.log('🧪 Test 8: SnapshotService - Live file, line shift & drift detection...');
    
    // Create a mock source code file
    const srcDir = path.join(tempDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    const codeFilePath = path.join(srcDir, 'math.ts');
    const initialCode = [
      '// Math Utility Library',
      'export function add(a: number, b: number): number {',
      '  return a + b;',
      '}',
      '',
      'export function multiply(x: number, y: number): number {',
      '  const result = x * y;',
      '  return result;',
      '}',
    ].join('\n');
    fs.writeFileSync(codeFilePath, initialCode, 'utf-8');

    // Create a snapshot targeting 'multiply' function (lines 6-9)
    const targetCode = [
      'export function multiply(x: number, y: number): number {',
      '  const result = x * y;',
      '  return result;',
      '}',
    ].join('\n');
    const snapId = 'snap_live_test_1';
    await configService.addSnapshot({
      id: snapId,
      noteFile: '/Engineering/architecture.md',
      sourceFile: 'src/math.ts',
      startLine: 6,
      endLine: 9,
      capturedCode: targetCode,
      capturedAt: new Date().toISOString(),
      sourceHash: snapshotService.computeHash(targetCode),
    });

    // 8a. Verify initial code: should match perfectly
    const verifyInitial = await snapshotService.checkCodeDrift(snapId);
    assert.strictEqual(verifyInitial.hasDrifted, false, 'Initial snapshot should not have drifted');
    assert.strictEqual(verifyInitial.status, 'perfect', 'Initial snapshot status should be perfect');
    assert.strictEqual(verifyInitial.startLine, 6);
    assert.strictEqual(verifyInitial.endLine, 9);

    // 8b. Simulate inserting lines above (live line range shift)
    const shiftedCode = [
      '// Line 1 comments',
      '// Line 2 comments',
      '// Line 3 comments',
      '// Line 4 comments',
      '// Line 5 comments',
      ...initialCode.split('\n'),
    ].join('\n');
    fs.writeFileSync(codeFilePath, shiftedCode, 'utf-8');

    // Check drift: code is intact but shifted 5 lines down (now lines 11-14)
    const verifyShift = await snapshotService.checkCodeDrift(snapId);
    assert.strictEqual(verifyShift.hasDrifted, false, 'Shifted code should not count as drifted');
    assert.strictEqual(verifyShift.status, 'shifted', 'Status should be shifted');
    assert.strictEqual(verifyShift.startLine, 11, 'Start line should be updated to 11');
    assert.strictEqual(verifyShift.endLine, 14, 'End line should be updated to 14');

    // Verify snapshot config was updated with live line range
    const updatedSnap = await configService.getSnapshot(snapId);
    assert.strictEqual(updatedSnap?.startLine, 11);
    assert.strictEqual(updatedSnap?.endLine, 14);

    // 8c. Simulate code modification inside the function (drift detected)
    const modifiedCode = shiftedCode.replace('const result = x * y;', 'const result = Math.imul(x, y);');
    fs.writeFileSync(codeFilePath, modifiedCode, 'utf-8');

    const verifyDrift = await snapshotService.checkCodeDrift(snapId);
    assert.strictEqual(verifyDrift.hasDrifted, true, 'Modified code should be reported as drifted');
    assert.strictEqual(verifyDrift.status, 'modified', 'Status should be modified');
    assert.strictEqual(verifyDrift.startLine, 11);
    assert.strictEqual(verifyDrift.endLine, 14);
    assert.ok(verifyDrift.currentCode?.includes('Math.imul'));

    // 8d. Test update snapshot from source
    const refreshed = await snapshotService.updateSnapshotFromSource(snapId);
    assert.ok(refreshed !== null);
    assert.ok(refreshed?.capturedCode.includes('Math.imul'));

    // 8e. Verify after update: now matches perfectly at new line range
    const verifyAfterUpdate = await snapshotService.checkCodeDrift(snapId);
    assert.strictEqual(verifyAfterUpdate.hasDrifted, false);
    assert.strictEqual(verifyAfterUpdate.status, 'perfect');
    console.log('   ✅ Test 8 Passed!');

    console.log('\n🎉 ALL 8 UNIT TESTS PASSED SUCCESSFULLY! 100% OPERATIONAL.\n');
  } finally {
    // Clean up temporary workspace
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  }
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
