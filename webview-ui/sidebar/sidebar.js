/**
 * Sidebar JS — Main orchestrator for the sidebar webview.
 * Handles tree rendering, templates, timeline, search, tags, drag & drop,
 * context menus, and bidirectional communication with the extension.
 */

(function () {
  // @ts-ignore
  const vscode = acquireVsCodeApi();

  // ─── State ──────────────────────────────────────────────────
  let treeData = [];
  let pinnedPaths = [];
  let tagsData = {};
  let selectedPath = null;
  let activeFilterTag = null;
  let contextTarget = null;
  let isTimelineActive = false;
  let draggedPath = null;

  // ─── DOM Elements ───────────────────────────────────────────
  const treeContainer = document.getElementById('tree-container');
  const emptyState = document.getElementById('empty-state');
  const pinnedSection = document.getElementById('pinned-section');
  const pinnedList = document.getElementById('pinned-list');
  const sectionTree = document.getElementById('section-tree');
  const sectionTimeline = document.getElementById('section-timeline');
  const timelineContainer = document.getElementById('timeline-container');
  const tagSection = document.getElementById('tag-section');
  const tagCloud = document.getElementById('tag-cloud');
  const searchContainer = document.getElementById('search-container');
  const searchInput = document.getElementById('search-input');
  const contextMenu = document.getElementById('context-menu');
  const dialogOverlay = document.getElementById('dialog-overlay');
  const dialogMessage = document.getElementById('dialog-message');
  const templateModal = document.getElementById('template-modal-overlay');
  const templateList = document.getElementById('template-list');
  const sortSelect = document.getElementById('sort-select');

  // ─── Header Button Handlers ─────────────────────────────────

  document.getElementById('btn-search').addEventListener('click', () => {
    const isVisible = searchContainer.style.display !== 'none';
    searchContainer.style.display = isVisible ? 'none' : 'flex';
    if (!isVisible) {
      searchInput.focus();
    } else {
      searchInput.value = '';
      vscode.postMessage({ type: 'REQUEST_TREE' });
    }
  });

  document.getElementById('btn-search-close').addEventListener('click', () => {
    searchContainer.style.display = 'none';
    searchInput.value = '';
    vscode.postMessage({ type: 'REQUEST_TREE' });
  });

  document.getElementById('btn-new-folder').addEventListener('click', () => {
    showInlineInput(getTargetFolderPath(), 'folder');
  });

  document.getElementById('btn-new-note').addEventListener('click', () => {
    showInlineInput(getTargetFolderPath(), 'note');
  });

  document.getElementById('btn-empty-new-folder').addEventListener('click', () => {
    showInlineInput('/', 'folder');
  });

  const btnEmptyNewNote = document.getElementById('btn-empty-new-note');
  if (btnEmptyNewNote) {
    btnEmptyNewNote.addEventListener('click', () => {
      showInlineInput('/', 'note');
    });
  }

  document.getElementById('btn-new-template').addEventListener('click', () => {
    vscode.postMessage({ type: 'REQUEST_TEMPLATES' });
  });

  document.getElementById('btn-template-close').addEventListener('click', () => {
    templateModal.style.display = 'none';
  });

  document.getElementById('btn-timeline').addEventListener('click', () => {
    isTimelineActive = !isTimelineActive;
    if (isTimelineActive) {
      sectionTree.style.display = 'none';
      sectionTimeline.style.display = 'block';
      vscode.postMessage({ type: 'REQUEST_TIMELINE' });
    } else {
      sectionTimeline.style.display = 'none';
      sectionTree.style.display = 'flex';
      vscode.postMessage({ type: 'REQUEST_TREE' });
    }
  });

  document.getElementById('btn-refresh').addEventListener('click', () => {
    if (isTimelineActive) {
      vscode.postMessage({ type: 'REQUEST_TIMELINE' });
    } else {
      vscode.postMessage({ type: 'REQUEST_TREE' });
    }
  });

  if (sortSelect) {
    sortSelect.addEventListener('change', () => {
      vscode.postMessage({
        type: 'SET_SORT_ORDER',
        order: sortSelect.value,
      });
    });
  }

  // ─── Search Handler ─────────────────────────────────────────

  let searchTimeout;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      const query = searchInput.value.trim();
      if (query) {
        vscode.postMessage({ type: 'SEARCH', query });
      } else {
        vscode.postMessage({ type: 'REQUEST_TREE' });
      }
    }, 250);
  });

  // ─── Tree Rendering ─────────────────────────────────────────

  function renderTree(nodes, pinnedList_) {
    activeInlineElement = null;
    treeData = nodes;
    pinnedPaths = pinnedList_ || [];

    // Render pinned section
    renderPinned();

    // Render folder tree
    const treeHtml = nodes.length > 0 ? renderNodes(nodes, 0) : '';

    if (nodes.length === 0) {
      emptyState.style.display = 'flex';
      const existing = treeContainer.querySelectorAll('.tree-item, .tree-item-children-wrapper, .search-result');
      existing.forEach((el) => el.remove());
    } else {
      emptyState.style.display = 'none';
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = treeHtml;

      const existing = treeContainer.querySelectorAll('.tree-item, .tree-item-children-wrapper, .search-result');
      existing.forEach((el) => el.remove());

      while (tempDiv.firstChild) {
        treeContainer.appendChild(tempDiv.firstChild);
      }
    }

    if (selectedPath && !findNodeByPath(nodes, selectedPath)) {
      selectedPath = null;
    }
    updateHeaderTooltips();

    bindTreeEvents();
  }

  function renderNodes(nodes, depth) {
    let html = '';
    for (const node of nodes) {
      html += renderNode(node, depth);
    }
    return html;
  }

  function renderNode(node, depth) {
    const isFolder = node.type === 'folder';
    const indent = depth * 14;
    const chevron = isFolder
      ? `<span class="tree-item-chevron ${node.expanded ? 'expanded' : ''}" data-path="${escapeHtml(node.path)}">▶</span>`
      : `<span class="tree-item-chevron hidden"></span>`;

    const icon = isFolder
      ? `<span class="tree-item-icon folder">${node.expanded ? '📂' : '📁'}</span>`
      : `<span class="tree-item-icon note">📝</span>`;

    const pinIndicator = pinnedPaths.includes(node.path) ? ' ⭐' : '';

    const actionButtons = isFolder
      ? `<div class="tree-item-actions">
           <button class="tree-item-action-btn" data-action="add-note" title="New Note in ${escapeHtml(node.name)}">📝+</button>
           <button class="tree-item-action-btn" data-action="add-folder" title="New Folder in ${escapeHtml(node.name)}">📁+</button>
         </div>`
      : '';

    let html = `
      <div class="tree-item ${selectedPath === node.path ? 'selected' : ''}"
           data-path="${escapeHtml(node.path)}"
           data-type="${node.type}"
           data-name="${escapeHtml(node.name)}"
           draggable="true"
           style="padding-left: ${indent + 10}px">
        ${chevron}
        ${icon}
        <span class="tree-item-label">${escapeHtml(node.name)}${pinIndicator}</span>
        ${actionButtons}
      </div>
    `;

    if (isFolder && node.children && node.children.length > 0) {
      html += `<div class="tree-item-children-wrapper ${node.expanded ? '' : 'collapsed'}" data-folder-path="${escapeHtml(node.path)}">`;
      html += renderNodes(node.children, depth + 1);
      html += `</div>`;
    }

    return html;
  }

  // ─── Pinned Section ─────────────────────────────────────────

  function renderPinned() {
    if (pinnedPaths.length === 0) {
      pinnedSection.style.display = 'none';
      return;
    }

    pinnedSection.style.display = 'block';
    let html = '';

    for (const pinnedPath of pinnedPaths) {
      const name = pinnedPath.split('/').pop().replace(/\.(md|txt)$/, '');
      html += `
        <div class="pinned-item" data-path="${escapeHtml(pinnedPath)}">
          <span class="pinned-item-icon">⭐</span>
          <span class="pinned-item-label">${escapeHtml(name)}</span>
        </div>
      `;
    }

    pinnedList.innerHTML = html;

    pinnedList.querySelectorAll('.pinned-item').forEach((item) => {
      item.addEventListener('click', () => {
        const path = item.getAttribute('data-path');
        vscode.postMessage({ type: 'OPEN_NOTE', path });
      });
    });
  }

  // ─── Tag Cloud ──────────────────────────────────────────────

  function renderTags(tags) {
    tagsData = tags || {};
    const tagEntries = Object.entries(tagsData);

    if (tagEntries.length === 0) {
      tagSection.style.display = 'none';
      return;
    }

    tagSection.style.display = 'block';
    let html = '';

    for (const [tag, paths] of tagEntries) {
      const isActive = activeFilterTag === tag;
      html += `
        <span class="tag-badge ${isActive ? 'active' : ''}" data-tag="${escapeHtml(tag)}">
          ${escapeHtml(tag)}
          <span class="tag-count">(${paths.length})</span>
        </span>
      `;
    }

    tagCloud.innerHTML = html;

    tagCloud.querySelectorAll('.tag-badge').forEach((badge) => {
      badge.addEventListener('click', () => {
        const tag = badge.getAttribute('data-tag');
        if (activeFilterTag === tag) {
          activeFilterTag = null;
          vscode.postMessage({ type: 'REQUEST_TREE' });
        } else {
          activeFilterTag = tag;
          vscode.postMessage({ type: 'FILTER_BY_TAG', tag });
        }
        renderTags(tagsData);
      });
    });
  }

  // ─── Tree Events & Drag & Drop ──────────────────────────────

  function bindTreeEvents() {
    treeContainer.querySelectorAll('.tree-item').forEach((item) => {
      item.addEventListener('click', (e) => {
        const path = item.getAttribute('data-path');
        const type = item.getAttribute('data-type');

        // Check if chevron was clicked -> only toggle folder, do not change selection
        if (e.target.closest('.tree-item-chevron')) {
          if (type === 'folder') {
            toggleFolder(path, item);
          }
          return;
        }

        // Check if quick action button was clicked
        const actionBtn = e.target.closest('.tree-item-action-btn');
        if (actionBtn) {
          e.stopPropagation();
          const action = actionBtn.getAttribute('data-action');
          if (action === 'add-note') {
            showInlineInput(path, 'note');
          } else if (action === 'add-folder') {
            showInlineInput(path, 'folder');
          }
          return;
        }

        // Clicking an already selected item toggles selection OFF (returns to root)
        if (selectedPath === path) {
          clearSelection();
          if (type === 'folder') {
            toggleFolder(path, item);
          }
          return;
        }

        setSelection(path, item);

        if (type === 'folder') {
          // If selecting a collapsed folder, expand it
          const safePath = CSS && CSS.escape ? CSS.escape(path) : path.replace(/["\\]/g, '\\$&');
          const childrenWrapper = treeContainer.querySelector(
            `.tree-item-children-wrapper[data-folder-path="${safePath}"]`
          );
          if (childrenWrapper && childrenWrapper.classList.contains('collapsed')) {
            toggleFolder(path, item);
          }
        } else {
          vscode.postMessage({ type: 'OPEN_NOTE', path });
        }
      });

      item.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        contextTarget = {
          path: item.getAttribute('data-path'),
          type: item.getAttribute('data-type'),
          name: item.getAttribute('data-name'),
        };
        showContextMenu(e.clientX, e.clientY);
      });

      // Drag and drop handlers
      item.addEventListener('dragstart', (e) => {
        draggedPath = item.getAttribute('data-path');
        e.dataTransfer.setData('text/plain', draggedPath);
        item.style.opacity = '0.5';
      });

      item.addEventListener('dragend', () => {
        item.style.opacity = '1';
        draggedPath = null;
      });

      item.addEventListener('dragover', (e) => {
        e.preventDefault();
        const type = item.getAttribute('data-type');
        if (type === 'folder') {
          item.style.backgroundColor = 'var(--np-bg-hover)';
        }
      });

      item.addEventListener('dragleave', () => {
        item.style.backgroundColor = '';
      });

      item.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        item.style.backgroundColor = '';
        const targetPath = item.getAttribute('data-path');
        const targetType = item.getAttribute('data-type');

        if (draggedPath && targetType === 'folder' && draggedPath !== targetPath) {
          vscode.postMessage({
            type: 'MOVE_ITEM',
            oldPath: draggedPath,
            newParentPath: targetPath,
          });
        }
      });
    });
  }

  function toggleFolder(folderPath, element) {
    const safePath = CSS && CSS.escape ? CSS.escape(folderPath) : folderPath.replace(/["\\]/g, '\\$&');
    const childrenWrapper = treeContainer.querySelector(
      `.tree-item-children-wrapper[data-folder-path="${safePath}"]`
    );
    const chevron = element.querySelector('.tree-item-chevron');
    const icon = element.querySelector('.tree-item-icon');

    if (childrenWrapper) {
      const isCurrentlyCollapsed = childrenWrapper.classList.contains('collapsed');
      const willBeCollapsed = !isCurrentlyCollapsed;
      childrenWrapper.classList.toggle('collapsed');

      if (chevron) {
        chevron.classList.toggle('expanded', !willBeCollapsed);
      }
      if (icon) {
        icon.textContent = willBeCollapsed ? '📁' : '📂';
      }

      // If collapsing and selectedPath was inside or is this folder, clear selection so it doesn't trap new items
      if (willBeCollapsed && selectedPath && (selectedPath === folderPath || selectedPath.startsWith(folderPath + '/'))) {
        clearSelection();
      }

      vscode.postMessage({
        type: 'TOGGLE_FOLDER',
        path: folderPath,
        expanded: !willBeCollapsed,
      });
    }
  }

  // ─── Deselect & Empty Space Handlers ────────────────────────
  treeContainer.addEventListener('click', (e) => {
    if (e.target === treeContainer || !e.target.closest('.tree-item')) {
      clearSelection();
    }
  });

  treeContainer.addEventListener('dragover', (e) => {
    if (draggedPath) {
      e.preventDefault();
    }
  });

  treeContainer.addEventListener('drop', (e) => {
    if (draggedPath && (e.target === treeContainer || !e.target.closest('.tree-item'))) {
      e.preventDefault();
      vscode.postMessage({
        type: 'MOVE_ITEM',
        oldPath: draggedPath,
        newParentPath: '/',
      });
    }
  });

  treeContainer.addEventListener('contextmenu', (e) => {
    if (!e.target.closest('.tree-item')) {
      e.preventDefault();
      contextTarget = {
        path: '/',
        type: 'root',
        name: 'Root',
      };
      showContextMenu(e.clientX, e.clientY);
    }
  });

  const treeSectionHeader = document.getElementById('tree-section-title')?.parentElement;
  if (treeSectionHeader) {
    treeSectionHeader.addEventListener('click', (e) => {
      if (e.target.tagName !== 'SELECT' && !e.target.closest('select')) {
        clearSelection();
      }
    });
    treeSectionHeader.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      contextTarget = {
        path: '/',
        type: 'root',
        name: 'Root',
      };
      showContextMenu(e.clientX, e.clientY);
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !activeInlineElement && dialogOverlay.style.display === 'none' && templateModal.style.display === 'none') {
      clearSelection();
    }
  });

  // ─── Timeline Rendering ─────────────────────────────────────

  function renderTimeline(groups) {
    if (!groups || groups.length === 0) {
      timelineContainer.innerHTML = `
        <div class="empty-state" style="padding: 16px;">
          <p class="empty-text">No notes in timeline</p>
        </div>
      `;
      return;
    }

    let html = '';
    for (const group of groups) {
      html += `<div class="timeline-group">`;
      html += `<div class="timeline-group-header">${escapeHtml(group.bucket)}</div>`;
      for (const note of group.notes) {
        html += `
          <div class="timeline-item" data-path="${escapeHtml(note.path)}">
            <span class="timeline-item-title">📝 ${escapeHtml(note.title)}</span>
            <span class="timeline-item-time">${escapeHtml(note.relativeTime)}</span>
          </div>
        `;
      }
      html += `</div>`;
    }

    timelineContainer.innerHTML = html;

    timelineContainer.querySelectorAll('.timeline-item').forEach((item) => {
      item.addEventListener('click', () => {
        const path = item.getAttribute('data-path');
        vscode.postMessage({ type: 'OPEN_NOTE', path });
      });
    });
  }

  // ─── Template Picker Rendering ──────────────────────────────

  function renderTemplates(templates) {
    let html = '';
    for (const t of templates) {
      html += `
        <div class="template-card" data-id="${escapeHtml(t.id)}" data-name="${escapeHtml(t.name)}">
          <div class="template-card-title">${escapeHtml(t.name)}</div>
          <div class="template-card-desc">${escapeHtml(t.description || '')}</div>
        </div>
      `;
    }

    templateList.innerHTML = html;
    templateModal.style.display = 'flex';

    templateList.querySelectorAll('.template-card').forEach((card) => {
      card.addEventListener('click', () => {
        const templateId = card.getAttribute('data-id');
        const defaultName = card.getAttribute('data-name').replace(/[^a-zA-Z0-9\s]/g, '').trim();
        templateModal.style.display = 'none';

        showInputDialog({
          title: `📋 Note Name for "${defaultName}"`,
          placeholder: 'Enter note name',
          defaultValue: defaultName,
          confirmText: 'Create Note',
          onConfirm: (name) => {
            vscode.postMessage({
              type: 'CREATE_NOTE',
              name,
              folderPath: getTargetFolderPath(),
              templateId,
            });
          },
        });
      });
    });
  }

  // ─── Context Menu ───────────────────────────────────────────

  function updateContextMenuItems() {
    const isRoot = !contextTarget || contextTarget.type === 'root';
    contextMenu.querySelectorAll('.context-menu-item').forEach((item) => {
      const action = item.getAttribute('data-action');
      if (isRoot) {
        if (action === 'new-note-root' || action === 'new-folder-root' || action === 'refresh') {
          item.style.display = 'flex';
        } else {
          item.style.display = 'none';
        }
      } else {
        if (action === 'refresh') {
          item.style.display = 'none';
        } else {
          item.style.display = 'flex';
        }
      }
    });

    const separators = contextMenu.querySelectorAll('.context-menu-separator');
    separators.forEach((sep, idx) => {
      if (isRoot) {
        sep.style.display = 'none';
      } else {
        sep.style.display = 'block';
      }
    });
  }

  function showContextMenu(x, y) {
    updateContextMenuItems();
    contextMenu.style.display = 'block';
    contextMenu.style.left = `${Math.min(x, window.innerWidth - 170)}px`;
    contextMenu.style.top = `${Math.min(y, window.innerHeight - 250)}px`;
  }

  function hideContextMenu() {
    contextMenu.style.display = 'none';
    contextTarget = null;
  }

  document.addEventListener('click', (e) => {
    if (!contextMenu.contains(e.target)) {
      hideContextMenu();
    }
  });

  contextMenu.querySelectorAll('.context-menu-item').forEach((item) => {
    item.addEventListener('click', () => {
      const action = item.getAttribute('data-action');
      if (!contextTarget) return;

      switch (action) {
        case 'rename':
          showRenameInput(contextTarget.path, contextTarget.name);
          break;
        case 'delete':
          showDeleteConfirmation(contextTarget.path, contextTarget.name, contextTarget.type);
          break;
        case 'pin':
          vscode.postMessage({
            type: 'PIN_ITEM',
            path: contextTarget.path,
            pinned: !pinnedPaths.includes(contextTarget.path),
          });
          break;
        case 'new-note': {
          const folderPath = contextTarget.type === 'folder'
            ? contextTarget.path
            : contextTarget.path.substring(0, contextTarget.path.lastIndexOf('/')) || '/';
          showInlineInput(folderPath, 'note');
          break;
        }
        case 'new-folder': {
          const parentPath = contextTarget.type === 'folder'
            ? contextTarget.path
            : contextTarget.path.substring(0, contextTarget.path.lastIndexOf('/')) || '/';
          showInlineInput(parentPath, 'folder');
          break;
        }
        case 'new-note-root': {
          showInlineInput('/', 'note');
          break;
        }
        case 'new-folder-root': {
          showInlineInput('/', 'folder');
          break;
        }
        case 'refresh': {
          vscode.postMessage({ type: 'REQUEST_TREE' });
          break;
        }
      }

      hideContextMenu();
    });
  });

  // ─── Inline Input & Dialogs ─────────────────────────────────

  let activeInlineElement = null;

  function cancelActiveInline() {
    if (activeInlineElement) {
      const el = activeInlineElement;
      activeInlineElement = null;
      el.remove();
      if (treeData.length === 0) {
        emptyState.style.display = 'flex';
      }
    }
  }

  function findNodeByPath(nodes, path) {
    if (!nodes) return null;
    for (const node of nodes) {
      if (node.path === path) return node;
      if (node.children) {
        const found = findNodeByPath(node.children, path);
        if (found) return found;
      }
    }
    return null;
  }

  function getTargetFolderPath() {
    if (!selectedPath) return '/';
    const node = findNodeByPath(treeData, selectedPath);
    if (!node) return '/';
    if (node.type === 'folder') {
      const safePath = CSS && CSS.escape ? CSS.escape(node.path) : node.path.replace(/["\\]/g, '\\$&');
      const wrapper = treeContainer.querySelector(
        `.tree-item-children-wrapper[data-folder-path="${safePath}"]`
      );
      if (wrapper && wrapper.classList.contains('collapsed')) {
        const lastSlash = node.path.lastIndexOf('/');
        return lastSlash > 0 ? node.path.substring(0, lastSlash) : '/';
      }
      return node.path;
    }
    const lastSlash = node.path.lastIndexOf('/');
    return lastSlash > 0 ? node.path.substring(0, lastSlash) : '/';
  }

  function updateHeaderTooltips() {
    const btnNewFolder = document.getElementById('btn-new-folder');
    const btnNewNote = document.getElementById('btn-new-note');
    const targetFolder = getTargetFolderPath();

    if (!targetFolder || targetFolder === '/') {
      if (btnNewFolder) btnNewFolder.title = 'New Folder (Root)';
      if (btnNewNote) btnNewNote.title = 'New Note (Root)';
    } else {
      const folderName = targetFolder.split('/').pop() || targetFolder;
      if (btnNewFolder) btnNewFolder.title = `New Folder in "${folderName}" (Click empty area to deselect for Root)`;
      if (btnNewNote) btnNewNote.title = `New Note in "${folderName}" (Click empty area to deselect for Root)`;
    }
  }

  function clearSelection() {
    selectedPath = null;
    treeContainer.querySelectorAll('.tree-item').forEach((i) => i.classList.remove('selected'));
    updateHeaderTooltips();
  }

  function setSelection(path, element) {
    selectedPath = path;
    treeContainer.querySelectorAll('.tree-item').forEach((i) => i.classList.remove('selected'));
    if (element) {
      element.classList.add('selected');
    }
    updateHeaderTooltips();
  }

  function showInputDialog({ title, placeholder, defaultValue, confirmText, onConfirm }) {
    const overlay = document.getElementById('input-dialog-overlay');
    const titleEl = document.getElementById('input-dialog-title');
    const fieldEl = document.getElementById('input-dialog-field');
    const confirmBtn = document.getElementById('input-dialog-confirm');
    const cancelBtn = document.getElementById('input-dialog-cancel');

    if (!overlay || !fieldEl || !confirmBtn || !cancelBtn) return;

    titleEl.textContent = title || 'Enter Name';
    fieldEl.placeholder = placeholder || '';
    fieldEl.value = defaultValue || '';
    confirmBtn.textContent = confirmText || 'OK';
    overlay.style.display = 'flex';

    setTimeout(() => {
      fieldEl.focus();
      fieldEl.select();
    }, 50);

    let resolved = false;

    const cleanup = () => {
      if (resolved) return;
      resolved = true;
      overlay.style.display = 'none';
      confirmBtn.removeEventListener('click', handleConfirm);
      cancelBtn.removeEventListener('click', handleCancel);
      fieldEl.removeEventListener('keydown', handleKeyDown);
    };

    const handleConfirm = () => {
      const val = fieldEl.value.trim();
      if (val) {
        cleanup();
        onConfirm(val);
      } else {
        fieldEl.focus();
      }
    };

    const handleCancel = () => {
      cleanup();
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleConfirm();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleCancel();
      }
    };

    confirmBtn.addEventListener('click', handleConfirm);
    cancelBtn.addEventListener('click', handleCancel);
    fieldEl.addEventListener('keydown', handleKeyDown);
  }

  function showInlineInput(parentPath, itemType) {
    if (isTimelineActive) {
      isTimelineActive = false;
      sectionTimeline.style.display = 'none';
      sectionTree.style.display = 'flex';
      vscode.postMessage({ type: 'REQUEST_TREE' });
    }

    if (searchInput.value.trim()) {
      searchInput.value = '';
      searchContainer.style.display = 'none';
      vscode.postMessage({ type: 'REQUEST_TREE' });
    }

    cancelActiveInline();

    const isRoot = !parentPath || parentPath === '/';
    let targetContainer = null;
    let indent = 10;

    if (isRoot) {
      targetContainer = treeContainer;
      indent = 10;
    } else {
      const folderItems = treeContainer.querySelectorAll('.tree-item');
      let folderItem = null;
      for (const item of folderItems) {
        if (item.getAttribute('data-path') === parentPath) {
          folderItem = item;
          break;
        }
      }

      if (folderItem) {
        const currentPad = parseInt(folderItem.style.paddingLeft || '10', 10);
        indent = currentPad + 14;

        let childrenWrapper = null;
        const wrappers = treeContainer.querySelectorAll('.tree-item-children-wrapper');
        for (const w of wrappers) {
          if (w.getAttribute('data-folder-path') === parentPath) {
            childrenWrapper = w;
            break;
          }
        }

        if (!childrenWrapper) {
          childrenWrapper = document.createElement('div');
          childrenWrapper.className = 'tree-item-children-wrapper';
          childrenWrapper.setAttribute('data-folder-path', parentPath);
          folderItem.after(childrenWrapper);
        }

        childrenWrapper.classList.remove('collapsed');
        const chevron = folderItem.querySelector('.tree-item-chevron');
        if (chevron) {
          chevron.classList.remove('hidden');
          chevron.classList.add('expanded');
        }
        const icon = folderItem.querySelector('.tree-item-icon');
        if (icon) {
          icon.textContent = '📂';
        }

        targetContainer = childrenWrapper;
      } else {
        targetContainer = treeContainer;
        indent = 10;
      }
    }

    if (!targetContainer) {
      showInputDialog({
        title: itemType === 'folder' ? '📁 New Folder' : '📝 New Note',
        placeholder: itemType === 'folder' ? 'Folder name' : 'Note name',
        defaultValue: '',
        confirmText: 'Create',
        onConfirm: (name) => {
          if (itemType === 'folder') {
            vscode.postMessage({ type: 'CREATE_FOLDER', name, parentPath });
          } else {
            vscode.postMessage({ type: 'CREATE_NOTE', name, folderPath: parentPath });
          }
        },
      });
      return;
    }

    emptyState.style.display = 'none';

    const inlineRow = document.createElement('div');
    inlineRow.className = 'tree-item inline-create-row';
    inlineRow.style.paddingLeft = `${indent}px`;

    const isFolder = itemType === 'folder';
    inlineRow.innerHTML = `
      <span class="tree-item-chevron hidden">▶</span>
      <span class="tree-item-icon ${isFolder ? 'folder' : 'note'}">${isFolder ? '📁' : '📝'}</span>
      <input type="text" class="inline-input" placeholder="${isFolder ? 'Folder name...' : 'Note name...'}" spellcheck="false" autocomplete="off" />
    `;

    inlineRow.addEventListener('click', (e) => e.stopPropagation());
    inlineRow.addEventListener('mousedown', (e) => e.stopPropagation());

    targetContainer.prepend(inlineRow);

    activeInlineElement = inlineRow;
    const input = inlineRow.querySelector('input');

    let finished = false;
    const finish = (shouldSave) => {
      if (finished) return;
      finished = true;
      activeInlineElement = null;
      const name = input.value.trim();
      inlineRow.remove();

      if (shouldSave && name) {
        clearSelection();
        if (isFolder) {
          vscode.postMessage({
            type: 'CREATE_FOLDER',
            name,
            parentPath: isRoot ? '/' : parentPath,
          });
        } else {
          vscode.postMessage({
            type: 'CREATE_NOTE',
            name,
            folderPath: isRoot ? '/' : parentPath,
          });
        }
      } else {
        if (treeData.length === 0) {
          emptyState.style.display = 'flex';
        }
      }
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        finish(true);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        finish(false);
      }
    });

    input.addEventListener('blur', () => {
      finish(input.value.trim().length > 0);
    });

    setTimeout(() => {
      input.focus();
    }, 50);
  }

  function showRenameInput(itemPath, currentName) {
    cancelActiveInline();

    const items = treeContainer.querySelectorAll('.tree-item');
    let itemEl = null;
    for (const item of items) {
      if (item.getAttribute('data-path') === itemPath) {
        itemEl = item;
        break;
      }
    }

    if (!itemEl) {
      showInputDialog({
        title: '✏️ Rename',
        placeholder: 'Enter new name',
        defaultValue: currentName,
        confirmText: 'Rename',
        onConfirm: (newName) => {
          if (newName && newName !== currentName) {
            vscode.postMessage({
              type: 'RENAME_ITEM',
              oldPath: itemPath,
              newName: newName.trim(),
            });
          }
        },
      });
      return;
    }

    const labelEl = itemEl.querySelector('.tree-item-label');
    if (!labelEl) return;

    labelEl.style.display = 'none';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'inline-input';
    input.value = currentName;
    input.spellcheck = false;
    input.autocomplete = 'off';

    labelEl.after(input);

    let finished = false;
    const finish = (shouldSave) => {
      if (finished) return;
      finished = true;
      const newName = input.value.trim();
      input.remove();
      labelEl.style.display = '';

      if (shouldSave && newName && newName !== currentName) {
        vscode.postMessage({
          type: 'RENAME_ITEM',
          oldPath: itemPath,
          newName,
        });
      }
    };

    input.addEventListener('click', (e) => e.stopPropagation());
    input.addEventListener('mousedown', (e) => e.stopPropagation());

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        finish(true);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        finish(false);
      }
    });

    input.addEventListener('blur', () => {
      finish(true);
    });

    setTimeout(() => {
      input.focus();
      const dotIndex = currentName.lastIndexOf('.');
      if (dotIndex > 0) {
        input.setSelectionRange(0, dotIndex);
      } else {
        input.select();
      }
    }, 50);
  }

  function showDeleteConfirmation(path, name, type) {
    dialogMessage.textContent = `Delete ${type} "${name}"? This cannot be undone.`;
    dialogOverlay.style.display = 'flex';

    const confirmBtn = document.getElementById('dialog-confirm');
    const cancelBtn = document.getElementById('dialog-cancel');

    const handleConfirm = () => {
      vscode.postMessage({
        type: 'DELETE_ITEM',
        path,
        isFolder: type === 'folder',
      });
      dialogOverlay.style.display = 'none';
      cleanup();
    };

    const handleCancel = () => {
      dialogOverlay.style.display = 'none';
      cleanup();
    };

    function cleanup() {
      confirmBtn.removeEventListener('click', handleConfirm);
      cancelBtn.removeEventListener('click', handleCancel);
    }

    confirmBtn.addEventListener('click', handleConfirm);
    cancelBtn.addEventListener('click', handleCancel);
  }

  // ─── Search Results ─────────────────────────────────────────

  function renderSearchResults(results) {
    if (!results || results.length === 0) {
      emptyState.style.display = 'flex';
      const existing = treeContainer.querySelectorAll('.tree-item, .tree-item-children-wrapper, .search-result');
      existing.forEach((el) => el.remove());

      const noResults = document.createElement('div');
      noResults.className = 'empty-state search-result';
      noResults.innerHTML = `
        <div class="empty-icon">🔍</div>
        <p class="empty-text">No results found</p>
      `;
      treeContainer.appendChild(noResults);
      return;
    }

    emptyState.style.display = 'none';
    let html = '';
    for (const result of results) {
      html += `
        <div class="tree-item search-result" data-path="${escapeHtml(result.path)}" data-type="note">
          <span class="tree-item-icon note">📝</span>
          <div style="display: flex; flex-direction: column; overflow: hidden; margin-left: 4px;">
            <span class="tree-item-label" style="font-weight: 600;">${escapeHtml(result.title)}</span>
            <span style="font-size: 10px; color: var(--np-text-secondary); text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${escapeHtml(result.snippet || '')}</span>
          </div>
        </div>
      `;
    }

    const existing = treeContainer.querySelectorAll('.tree-item, .tree-item-children-wrapper, .search-result');
    existing.forEach((el) => el.remove());

    treeContainer.insertAdjacentHTML('afterbegin', html);
    bindTreeEvents();
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ─── Message Listener ──────────────────────────────────────

  window.addEventListener('message', (event) => {
    const message = event.data;

    switch (message.type) {
      case 'TREE_UPDATED':
        renderTree(message.tree, message.pinned);
        break;
      case 'SEARCH_RESULTS':
        renderSearchResults(message.results);
        break;
      case 'TAGS_UPDATED':
        renderTags(message.tags);
        break;
      case 'TEMPLATES_LIST':
        renderTemplates(message.templates);
        break;
      case 'TIMELINE_UPDATED':
        renderTimeline(message.groups);
        break;
      case 'ERROR':
        console.error('[NotePad Sidebar]', message.message);
        break;
    }
  });

  // ─── Initialize ─────────────────────────────────────────────
  updateHeaderTooltips();
  vscode.postMessage({ type: 'WEBVIEW_READY' });
})();
