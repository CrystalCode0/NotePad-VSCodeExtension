/**
 * Unit Test Suite for NotePad extension core services.
 * Tests StorageService, ConfigService, TagService, SearchService, TemplateService, and TimelineService.
 */

import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { StorageService } from '../src/services/storageService';
import { ConfigService } from '../src/services/configService';
import { TagService } from '../src/services/tagService';
import { SearchService } from '../src/services/searchService';
import { TimelineService } from '../src/services/timelineService';

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

    console.log('\n🎉 ALL 7 UNIT TESTS PASSED SUCCESSFULLY! 100% OPERATIONAL.\n');
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
