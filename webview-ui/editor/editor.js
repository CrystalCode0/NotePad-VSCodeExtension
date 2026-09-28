/**
 * Editor JS — Interactive NotePad Rich & Markdown Editor
 * Supports in-place interactive tasks (clickable checkboxes, strikethrough, stats progress),
 * rich block formatting (headings, lists, quotes, code), instant auto-conversion (e.g. typing - [ ]),
 * raw markdown mode switcher, code snapshots, and auto-save.
 */

(function () {
  // @ts-ignore
  const vscode = acquireVsCodeApi();

  // ─── State ──────────────────────────────────────────────────
  let currentPath = null;
  let isDirty = false;
  let saveTimeout = null;
  const AUTO_SAVE_DELAY = 1000; // ms
  let snapshots = {};
  let viewMode = 'rich'; // 'rich' | 'raw'
  let frontmatterText = ''; // Stores frontmatter if present

  // ─── DOM Elements ───────────────────────────────────────────
  const richEditor = document.getElementById('rich-editor');
  const textarea = document.getElementById('editor-textarea');
  const btnModeRich = document.getElementById('btn-mode-rich');
  const btnModeRaw = document.getElementById('btn-mode-raw');

  const statusWords = document.getElementById('status-words');
  const statusChars = document.getElementById('status-chars');
  const statusSave = document.getElementById('status-save');
  const statusTime = document.getElementById('status-time');
  const statusBranch = document.getElementById('status-branch');
  const statusTasksWidget = document.getElementById('status-tasks-widget');
  const tasksBadge = document.getElementById('tasks-badge');
  const tasksProgressBar = document.getElementById('tasks-progress-bar');
  const statusTasksSep = document.getElementById('status-tasks-sep');
  const snapshotsContainer = document.getElementById('snapshots-container');

  // Modals
  const modalLinkOverlay = document.getElementById('modal-link-overlay');
  const modalLinkText = document.getElementById('modal-link-text');
  const modalLinkUrl = document.getElementById('modal-link-url');
  const modalLinkClose = document.getElementById('modal-link-close');
  const modalLinkCancel = document.getElementById('modal-link-cancel');
  const modalLinkInsert = document.getElementById('modal-link-insert');

  const modalTagOverlay = document.getElementById('modal-tag-overlay');
  const modalTagName = document.getElementById('modal-tag-name');
  const modalTagClose = document.getElementById('modal-tag-close');
  const modalTagCancel = document.getElementById('modal-tag-cancel');
  const modalTagInsert = document.getElementById('modal-tag-insert');
  const modalQuickTags = document.getElementById('modal-quick-tags');

  let savedSelectionRange = null;
  let savedRawSelection = null;

  // ─── Helpers: HTML Escaping & Inline Markdown ───────────────

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function createCodeBlockElement(lang, codeText) {
    const codeEl = document.createElement('div');
    codeEl.className = 'code-block';
    codeEl.setAttribute('data-lang', lang || '');
    codeEl.setAttribute('contenteditable', 'false');
    codeEl.innerHTML = `
      <div class="code-block-header">
        <span class="code-block-lang">${escapeHtml(lang || 'code')}</span>
        <button class="code-block-delete-btn" type="button" title="Delete code block" contenteditable="false">🗑️ Delete</button>
      </div>
      <code class="code-content" contenteditable="true">${escapeHtml(codeText || '')}</code>
    `;
    return codeEl;
  }

  function renderInline(text) {
    if (!text || text.trim() === '') return '<br>';
    let html = escapeHtml(text);

    // Bold: **text** or __text__
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');

    // Italic: *text* or _text_
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    html = html.replace(/_(.+?)_/g, '<em>$1</em>');

    // Inline code: `code`
    html = html.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

    // Links: [text](url)
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a class="editor-link" href="$2" target="_blank" contenteditable="false">$1</a>');

    // Tags: #tag
    html = html.replace(/(^|\s)#([a-zA-Z0-9_\-\/]+)/g, '$1<span class="note-tag" contenteditable="false">#$2</span>');

    return html;
  }

  function inlineToMarkdown(node) {
    if (!node) return '';
    let result = '';

    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        result += child.nodeValue || '';
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child;
        const tag = el.tagName.toUpperCase();

        if (tag === 'STRONG' || tag === 'B') {
          result += `**${inlineToMarkdown(el)}**`;
        } else if (tag === 'EM' || tag === 'I') {
          result += `*${inlineToMarkdown(el)}*`;
        } else if (tag === 'CODE') {
          result += `\`${el.textContent || ''}\``;
        } else if (tag === 'A') {
          const href = el.getAttribute('href') || '';
          result += `[${el.textContent || ''}](${href})`;
        } else if (el.classList.contains('note-tag')) {
          result += el.textContent || '';
        } else if (tag === 'BR') {
          // Only add newline if not trailing single BR
          if (node.childNodes.length > 1) {
            result += '\n';
          }
        } else {
          result += inlineToMarkdown(el);
        }
      }
    });

    return result;
  }

  // ─── Markdown Parsing -> Rich In-Place DOM ──────────────────

  function parseMarkdownToRich(mdContent) {
    if (!mdContent) mdContent = '';
    frontmatterText = '';
    richEditor.innerHTML = '';

    // 1. Extract Frontmatter if present
    const fmMatch = mdContent.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
    let remaining = mdContent;
    if (fmMatch) {
      frontmatterText = fmMatch[1];
      remaining = mdContent.slice(fmMatch[0].length);

      const fmCard = document.createElement('div');
      fmCard.className = 'note-frontmatter';
      fmCard.setAttribute('contenteditable', 'false');
      fmCard.innerHTML = `<span class="note-frontmatter-badge">Frontmatter</span> <span>Note properties preserved</span>`;
      richEditor.appendChild(fmCard);
    }

    const lines = remaining.split(/\r?\n/);
    let inCodeBlock = false;
    let codeBlockLang = '';
    let codeBlockLines = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Handle Code Blocks ```
      if (line.trim().startsWith('```')) {
        if (!inCodeBlock) {
          inCodeBlock = true;
          codeBlockLang = line.trim().slice(3).trim();
          codeBlockLines = [];
        } else {
          // End of code block
          inCodeBlock = false;
          const codeEl = createCodeBlockElement(codeBlockLang, codeBlockLines.join('\n'));
          richEditor.appendChild(codeEl);
        }
        continue;
      }

      if (inCodeBlock) {
        codeBlockLines.push(line);
        continue;
      }

      // Horizontal Rule
      if (/^(---|\*\*\*|___)\s*$/.test(line)) {
        const hr = document.createElement('hr');
        hr.className = 'divider-line';
        hr.setAttribute('contenteditable', 'false');
        richEditor.appendChild(hr);
        continue;
      }

      // Headings
      const hMatch = line.match(/^(#{1,4})\s+(.*)$/);
      if (hMatch) {
        const level = hMatch[1].length;
        const text = hMatch[2];
        const hEl = document.createElement(`h${level}`);
        hEl.className = `editor-h${level}`;
        hEl.innerHTML = renderInline(text);
        richEditor.appendChild(hEl);
        continue;
      }

      // Task Items / Checklists: - [ ] Task or - [x] Task (also * [ ])
      const taskMatch = line.match(/^[-*]\s*\[([ xX])\]\s*(.*)$/);
      if (taskMatch) {
        const checked = taskMatch[1].toLowerCase() === 'x';
        const text = taskMatch[2];

        const taskRow = document.createElement('div');
        taskRow.className = `task-row ${checked ? 'completed' : ''}`;
        taskRow.innerHTML = `
          <span class="task-checkbox-container" contenteditable="false">
            <input type="checkbox" class="task-checkbox" ${checked ? 'checked' : ''} />
          </span>
          <div class="task-label ${checked ? 'completed' : ''}" contenteditable="true">${renderInline(text)}</div>
        `;
        richEditor.appendChild(taskRow);
        continue;
      }

      // Bullet Lists: - Item or * Item
      const bulletMatch = line.match(/^[-*]\s+(.*)$/);
      if (bulletMatch) {
        const text = bulletMatch[1];
        const bulletRow = document.createElement('div');
        bulletRow.className = 'bullet-row';
        bulletRow.innerHTML = `
          <span class="bullet-icon" contenteditable="false">•</span>
          <div class="bullet-text" contenteditable="true">${renderInline(text)}</div>
        `;
        richEditor.appendChild(bulletRow);
        continue;
      }

      // Numbered Lists: 1. Item
      const numMatch = line.match(/^(\d+)\.\s+(.*)$/);
      if (numMatch) {
        const num = numMatch[1];
        const text = numMatch[2];
        const numRow = document.createElement('div');
        numRow.className = 'numbered-row';
        numRow.innerHTML = `
          <span class="numbered-icon" contenteditable="false">${num}.</span>
          <div class="numbered-text" contenteditable="true">${renderInline(text)}</div>
        `;
        richEditor.appendChild(numRow);
        continue;
      }

      // Blockquotes: > Quote
      const quoteMatch = line.match(/^>\s*(.*)$/);
      if (quoteMatch) {
        const text = quoteMatch[1];
        const quoteEl = document.createElement('div');
        quoteEl.className = 'quote-block';
        quoteEl.innerHTML = `<div class="quote-text" contenteditable="true">${renderInline(text)}</div>`;
        richEditor.appendChild(quoteEl);
        continue;
      }

      // Paragraph / Regular line
      const p = document.createElement('p');
      p.className = 'paragraph-block';
      p.innerHTML = renderInline(line);
      richEditor.appendChild(p);
    }

    // Ensure at least one editable paragraph if empty
    if (richEditor.children.length === 0) {
      const p = document.createElement('p');
      p.className = 'paragraph-block';
      p.innerHTML = '<br>';
      richEditor.appendChild(p);
    }

    updateTaskStatistics();
    updateWordCount();
  }

  // ─── Serialization: Rich DOM -> Markdown ────────────────────

  function serializeRichToMarkdown() {
    const lines = [];

    if (frontmatterText) {
      lines.push('---');
      lines.push(frontmatterText.trim());
      lines.push('---');
      lines.push('');
    }

    const children = Array.from(richEditor.children);

    for (const child of children) {
      if (child.classList.contains('note-frontmatter')) {
        continue;
      }

      if (child.classList.contains('editor-h1')) {
        lines.push(`# ${inlineToMarkdown(child)}`);
      } else if (child.classList.contains('editor-h2')) {
        lines.push(`## ${inlineToMarkdown(child)}`);
      } else if (child.classList.contains('editor-h3')) {
        lines.push(`### ${inlineToMarkdown(child)}`);
      } else if (child.classList.contains('editor-h4')) {
        lines.push(`#### ${inlineToMarkdown(child)}`);
      } else if (child.classList.contains('task-row')) {
        const cb = child.querySelector('.task-checkbox');
        const isChecked = cb && cb.checked;
        const label = child.querySelector('.task-label');
        const text = label ? inlineToMarkdown(label) : '';
        lines.push(`- [${isChecked ? 'x' : ' '}] ${text}`);
      } else if (child.classList.contains('bullet-row')) {
        const textEl = child.querySelector('.bullet-text');
        const text = textEl ? inlineToMarkdown(textEl) : '';
        lines.push(`- ${text}`);
      } else if (child.classList.contains('numbered-row')) {
        const iconEl = child.querySelector('.numbered-icon');
        const textEl = child.querySelector('.numbered-text');
        const num = iconEl ? iconEl.textContent.trim() : '1.';
        const text = textEl ? inlineToMarkdown(textEl) : '';
        lines.push(`${num} ${text}`);
      } else if (child.classList.contains('code-block')) {
        const lang = child.getAttribute('data-lang') || '';
        const codeEl = child.querySelector('.code-content');
        const code = codeEl ? codeEl.textContent : '';
        lines.push(`\`\`\`${lang}\n${code}\n\`\`\``);
      } else if (child.classList.contains('quote-block')) {
        const qTextEl = child.querySelector('.quote-text') || child;
        lines.push(`> ${inlineToMarkdown(qTextEl)}`);
      } else if (child.classList.contains('divider-line') || child.tagName === 'HR') {
        lines.push('---');
      } else {
        // Paragraph or general div
        const text = inlineToMarkdown(child);
        lines.push(text);
      }
    }

    return lines.join('\n');
  }

  function getCurrentContent() {
    if (viewMode === 'rich') {
      return serializeRichToMarkdown();
    } else {
      return textarea.value;
    }
  }

  // ─── Mode Switching (Rich <-> Markdown) ──────────────────────

  btnModeRich.addEventListener('click', () => {
    switchViewMode('rich');
  });

  btnModeRaw.addEventListener('click', () => {
    switchViewMode('raw');
  });

  function switchViewMode(mode) {
    if (viewMode === mode) return;

    if (mode === 'raw') {
      // Rich -> Raw
      const md = serializeRichToMarkdown();
      textarea.value = md;
      richEditor.style.display = 'none';
      textarea.style.display = 'block';
      btnModeRich.classList.remove('active');
      btnModeRaw.classList.add('active');
      viewMode = 'raw';
      textarea.focus();
    } else {
      // Raw -> Rich
      const md = textarea.value;
      parseMarkdownToRich(md);
      textarea.style.display = 'none';
      richEditor.style.display = 'block';
      btnModeRaw.classList.remove('active');
      btnModeRich.classList.add('active');
      viewMode = 'rich';
      richEditor.focus();
    }

    updateTaskStatistics();
    updateWordCount();
  }

  // ─── Interactive Task Checkbox Ticking ──────────────────────

  richEditor.addEventListener('change', (e) => {
    const target = e.target;
    if (target && target.classList.contains('task-checkbox')) {
      const taskRow = target.closest('.task-row');
      if (taskRow) {
        const label = taskRow.querySelector('.task-label');
        if (target.checked) {
          taskRow.classList.add('completed');
          if (label) label.classList.add('completed');
        } else {
          taskRow.classList.remove('completed');
          if (label) label.classList.remove('completed');
        }
      }
      updateTaskStatistics();
      markDirty();
      scheduleAutoSave();
    }
  });

  // ─── Task Statistics Bar ────────────────────────────────────

  function updateTaskStatistics() {
    let total = 0;
    let completed = 0;

    if (viewMode === 'rich') {
      const checkboxes = richEditor.querySelectorAll('.task-checkbox');
      total = checkboxes.length;
      checkboxes.forEach((cb) => {
        if (cb.checked) completed++;
      });
    } else {
      const text = textarea.value;
      const matches = text.match(/^[-*]\s*\[([ xX])\]/gm) || [];
      total = matches.length;
      matches.forEach((m) => {
        if (/\[[xX]\]/.test(m)) completed++;
      });
    }

    if (total > 0) {
      statusTasksWidget.style.display = 'flex';
      statusTasksSep.style.display = 'inline';

      const pct = Math.round((completed / total) * 100);
      tasksProgressBar.style.width = `${pct}%`;

      if (completed === total) {
        tasksBadge.textContent = `✓ All ${total} tasks done 🎉`;
        tasksBadge.classList.add('completed-all');
        tasksProgressBar.classList.add('completed-all');
      } else {
        tasksBadge.textContent = `Tasks: ${completed}/${total} (${pct}%)`;
        tasksBadge.classList.remove('completed-all');
        tasksProgressBar.classList.remove('completed-all');
      }
    } else {
      statusTasksWidget.style.display = 'none';
      statusTasksSep.style.display = 'none';
    }
  }

  // ─── Rich Keyboard Handlers & Smart Typing ──────────────────

  richEditor.addEventListener('keydown', (e) => {
    // Shortcuts
    if (e.ctrlKey || e.metaKey) {
      const key = e.key.toLowerCase();
      if (key === 'b') {
        e.preventDefault();
        document.execCommand('bold', false, null);
        markDirty();
        scheduleAutoSave();
        updateToolbarState();
        return;
      }
      if (key === 'i') {
        e.preventDefault();
        document.execCommand('italic', false, null);
        markDirty();
        scheduleAutoSave();
        updateToolbarState();
        return;
      }
      if (key === 'k') {
        e.preventDefault();
        openLinkModal();
        return;
      }
      if (key === 's') {
        e.preventDefault();
        saveNote();
        return;
      }
      if (key === 'c' && e.shiftKey) {
        e.preventDefault();
        insertInteractiveTask();
        updateToolbarState();
        return;
      }
    }

    // Backspace on empty code block deletes the block
    if (e.key === 'Backspace') {
      const sel = window.getSelection();
      if (sel && sel.rangeCount) {
        const anchorNode = sel.anchorNode;
        const el = anchorNode.nodeType === Node.ELEMENT_NODE ? anchorNode : anchorNode.parentElement;
        const codeContent = el ? el.closest('.code-content') : null;
        if (codeContent && (codeContent.textContent.trim() === '' || codeContent.textContent === '\n')) {
          e.preventDefault();
          const block = codeContent.closest('.code-block');
          if (block) {
            const p = document.createElement('p');
            p.className = 'paragraph-block';
            p.innerHTML = '<br>';
            block.parentElement.replaceChild(p, block);
            setCursorToEnd(p);
            markDirty();
            scheduleAutoSave();
            updateToolbarState();
            return;
          }
        }
      }
    }

    // Enter key handling in task rows, lists
    if (e.key === 'Enter') {
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount) return;
      const anchorNode = sel.anchorNode;

      // Inside Task Label
      const taskLabel = anchorNode.nodeType === Node.ELEMENT_NODE
        ? anchorNode.closest('.task-label')
        : anchorNode.parentElement ? anchorNode.parentElement.closest('.task-label') : null;

      if (taskLabel) {
        e.preventDefault();
        const currentTaskRow = taskLabel.closest('.task-row');
        const textContent = taskLabel.textContent.trim();

        if (!textContent) {
          // Empty task row: convert to normal paragraph to exit task list
          const p = document.createElement('p');
          p.className = 'paragraph-block';
          p.innerHTML = '<br>';
          currentTaskRow.parentElement.replaceChild(p, currentTaskRow);
          setCursorToEnd(p);
        } else {
          // Create new task row right below
          const newTaskRow = document.createElement('div');
          newTaskRow.className = 'task-row';
          newTaskRow.innerHTML = `
            <span class="task-checkbox-container" contenteditable="false">
              <input type="checkbox" class="task-checkbox" />
            </span>
            <div class="task-label" contenteditable="true"><br></div>
          `;
          currentTaskRow.after(newTaskRow);
          const newLabel = newTaskRow.querySelector('.task-label');
          setCursorToEnd(newLabel);
        }

        updateTaskStatistics();
        markDirty();
        scheduleAutoSave();
        return;
      }

      // Inside Bullet Text
      const bulletText = anchorNode.nodeType === Node.ELEMENT_NODE
        ? anchorNode.closest('.bullet-text')
        : anchorNode.parentElement ? anchorNode.parentElement.closest('.bullet-text') : null;

      if (bulletText) {
        e.preventDefault();
        const currentBulletRow = bulletText.closest('.bullet-row');
        const textContent = bulletText.textContent.trim();

        if (!textContent) {
          const p = document.createElement('p');
          p.className = 'paragraph-block';
          p.innerHTML = '<br>';
          currentBulletRow.parentElement.replaceChild(p, currentBulletRow);
          setCursorToEnd(p);
        } else {
          const newRow = document.createElement('div');
          newRow.className = 'bullet-row';
          newRow.innerHTML = `
            <span class="bullet-icon" contenteditable="false">•</span>
            <div class="bullet-text" contenteditable="true"><br></div>
          `;
          currentBulletRow.after(newRow);
          const newText = newRow.querySelector('.bullet-text');
          setCursorToEnd(newText);
        }

        markDirty();
        scheduleAutoSave();
        return;
      }

      // Inside Numbered Text
      const numberedText = anchorNode.nodeType === Node.ELEMENT_NODE
        ? anchorNode.closest('.numbered-text')
        : anchorNode.parentElement ? anchorNode.parentElement.closest('.numbered-text') : null;

      if (numberedText) {
        e.preventDefault();
        const currentNumberedRow = numberedText.closest('.numbered-row');
        const textContent = numberedText.textContent.trim();

        if (!textContent) {
          const p = document.createElement('p');
          p.className = 'paragraph-block';
          p.innerHTML = '<br>';
          currentNumberedRow.parentElement.replaceChild(p, currentNumberedRow);
          setCursorToEnd(p);
        } else {
          const iconEl = currentNumberedRow.querySelector('.numbered-icon');
          const currentNum = iconEl ? parseInt(iconEl.textContent) || 1 : 1;
          const nextNum = currentNum + 1;

          const newRow = document.createElement('div');
          newRow.className = 'numbered-row';
          newRow.innerHTML = `
            <span class="numbered-icon" contenteditable="false">${nextNum}.</span>
            <div class="numbered-text" contenteditable="true"><br></div>
          `;
          currentNumberedRow.after(newRow);
          const newText = newRow.querySelector('.numbered-text');
          setCursorToEnd(newText);
        }

        markDirty();
        scheduleAutoSave();
        return;
      }
    }

    // Backspace on empty task label converts it to normal paragraph
    if (e.key === 'Backspace') {
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount) return;
      const anchorNode = sel.anchorNode;

      const taskLabel = anchorNode.nodeType === Node.ELEMENT_NODE
        ? anchorNode.closest('.task-label')
        : anchorNode.parentElement ? anchorNode.parentElement.closest('.task-label') : null;

      if (taskLabel && !taskLabel.textContent.trim()) {
        e.preventDefault();
        const taskRow = taskLabel.closest('.task-row');
        const p = document.createElement('p');
        p.className = 'paragraph-block';
        p.innerHTML = '<br>';
        taskRow.parentElement.replaceChild(p, taskRow);
        setCursorToEnd(p);
        updateTaskStatistics();
        markDirty();
        scheduleAutoSave();
        return;
      }
    }
  });

  // Real-time block transformation on typing (e.g. typing '- [ ] ' creates task)
  richEditor.addEventListener('input', () => {
    checkSmartTransformations();
    markDirty();
    updateWordCount();
    updateTaskStatistics();
    scheduleAutoSave();
  });

  function checkSmartTransformations() {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const node = sel.anchorNode;
    if (!node) return;

    const block = node.nodeType === Node.ELEMENT_NODE
      ? node.closest('.paragraph-block')
      : node.parentElement ? node.parentElement.closest('.paragraph-block') : null;

    if (!block) return;
    const text = block.textContent;

    // Check for '- [ ] ' or '- [x] '
    const taskMatch = text.match(/^[-*]\s*\[([ xX])\]\s*(.*)$/);
    if (taskMatch) {
      const checked = taskMatch[1].toLowerCase() === 'x';
      const labelText = taskMatch[2];

      const taskRow = document.createElement('div');
      taskRow.className = `task-row ${checked ? 'completed' : ''}`;
      taskRow.innerHTML = `
        <span class="task-checkbox-container" contenteditable="false">
          <input type="checkbox" class="task-checkbox" ${checked ? 'checked' : ''} />
        </span>
        <div class="task-label ${checked ? 'completed' : ''}" contenteditable="true">${escapeHtml(labelText) || '<br>'}</div>
      `;
      block.parentElement.replaceChild(taskRow, block);
      const labelEl = taskRow.querySelector('.task-label');
      setCursorToEnd(labelEl);
      updateTaskStatistics();
      return;
    }

    // Check for Headings: '# ', '## ', '### '
    const hMatch = text.match(/^(#{1,3})\s+(.*)$/);
    if (hMatch) {
      const level = hMatch[1].length;
      const hText = hMatch[2];
      const hEl = document.createElement(`h${level}`);
      hEl.className = `editor-h${level}`;
      hEl.innerHTML = escapeHtml(hText) || '<br>';
      block.parentElement.replaceChild(hEl, block);
      setCursorToEnd(hEl);
      return;
    }

    // Check for Bullet: '- ' or '* '
    const bulletMatch = text.match(/^[-*]\s+(.*)$/);
    if (bulletMatch) {
      const bText = bulletMatch[1];
      const bulletRow = document.createElement('div');
      bulletRow.className = 'bullet-row';
      bulletRow.innerHTML = `
        <span class="bullet-icon" contenteditable="false">•</span>
        <div class="bullet-text" contenteditable="true">${escapeHtml(bText) || '<br>'}</div>
      `;
      block.parentElement.replaceChild(bulletRow, block);
      const bEl = bulletRow.querySelector('.bullet-text');
      setCursorToEnd(bEl);
      return;
    }

    // Check for Numbered: '1. '
    const numMatch = text.match(/^(\d+)\.\s+(.*)$/);
    if (numMatch) {
      const num = numMatch[1];
      const nText = numMatch[2];
      const numRow = document.createElement('div');
      numRow.className = 'numbered-row';
      numRow.innerHTML = `
        <span class="numbered-icon" contenteditable="false">${num}.</span>
        <div class="numbered-text" contenteditable="true">${escapeHtml(nText) || '<br>'}</div>
      `;
      block.parentElement.replaceChild(numRow, block);
      const nEl = numRow.querySelector('.numbered-text');
      setCursorToEnd(nEl);
      return;
    }

    // Check for Quote: '> '
    const qMatch = text.match(/^>\s+(.*)$/);
    if (qMatch) {
      const qText = qMatch[1];
      const qEl = document.createElement('div');
      qEl.className = 'quote-block';
      qEl.innerHTML = `<div class="quote-text" contenteditable="true">${escapeHtml(qText) || '<br>'}</div>`;
      block.parentElement.replaceChild(qEl, block);
      const textEl = qEl.querySelector('.quote-text');
      setCursorToEnd(textEl);
      return;
    }
  }

  function setCursorToEnd(el) {
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function insertInteractiveTask() {
    if (viewMode === 'rich') {
      const taskRow = document.createElement('div');
      taskRow.className = 'task-row';
      taskRow.innerHTML = `
        <span class="task-checkbox-container" contenteditable="false">
          <input type="checkbox" class="task-checkbox" />
        </span>
        <div class="task-label" contenteditable="true"><br></div>
      `;

      // Insert at selection or append
      const sel = window.getSelection();
      if (sel && sel.rangeCount && richEditor.contains(sel.anchorNode)) {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        const block = sel.anchorNode.nodeType === Node.ELEMENT_NODE
          ? sel.anchorNode.closest('.paragraph-block, .task-row, .bullet-row, h1, h2, h3')
          : sel.anchorNode.parentElement.closest('.paragraph-block, .task-row, .bullet-row, h1, h2, h3');
        if (block && block.parentElement) {
          block.after(taskRow);
        } else {
          richEditor.appendChild(taskRow);
        }
      } else {
        richEditor.appendChild(taskRow);
      }

      const label = taskRow.querySelector('.task-label');
      setCursorToEnd(label);
      updateTaskStatistics();
      markDirty();
      scheduleAutoSave();
    } else {
      handleToolbarCommand('checklist');
    }
  }

  // ─── Toolbar Handlers ──────────────────────────────────────

  document.querySelectorAll('.toolbar-btn').forEach((btn) => {
    btn.addEventListener('mousedown', (e) => {
      // Prevent button click from stealing focus and collapsing editor selection
      e.preventDefault();
    });
    btn.addEventListener('click', () => {
      const command = btn.getAttribute('data-command');
      handleToolbarCommand(command);
    });
  });

  function handleToolbarCommand(command) {
    if (viewMode === 'rich') {
      switch (command) {
        case 'bold':
          document.execCommand('bold', false, null);
          break;
        case 'italic':
          document.execCommand('italic', false, null);
          break;
        case 'heading': {
          const sel = window.getSelection();
          if (sel && sel.rangeCount) {
            const anchor = sel.anchorNode;
            const el = anchor.nodeType === Node.ELEMENT_NODE ? anchor : anchor.parentElement;
            const block = el ? el.closest('h1, h2, h3, h4, .editor-h1, .editor-h2, .editor-h3, .editor-h4, .paragraph-block, .bullet-row, .numbered-row, .task-row') : null;
            if (block && richEditor.contains(block)) {
              const isHeading = /^H[1-4]$/i.test(block.tagName) || /editor-h[1-4]/.test(block.className);
              let newBlock;
              if (isHeading) {
                // Toggle off back to paragraph
                newBlock = document.createElement('p');
                newBlock.className = 'paragraph-block';
                newBlock.innerHTML = block.innerHTML || '<br>';
              } else {
                // Toggle on to heading 2
                newBlock = document.createElement('h2');
                newBlock.className = 'editor-h2';
                newBlock.innerHTML = block.innerHTML || '<br>';
              }
              block.parentElement.replaceChild(newBlock, block);
              setCursorToEnd(newBlock);
            } else {
              const h = document.createElement('h2');
              h.className = 'editor-h2';
              h.innerHTML = '<br>';
              richEditor.appendChild(h);
              setCursorToEnd(h);
            }
          }
          break;
        }
        case 'unordered-list': {
          const bRow = document.createElement('div');
          bRow.className = 'bullet-row';
          bRow.innerHTML = `<span class="bullet-icon" contenteditable="false">•</span><div class="bullet-text" contenteditable="true">List item</div>`;
          richEditor.appendChild(bRow);
          setCursorToEnd(bRow.querySelector('.bullet-text'));
          break;
        }
        case 'ordered-list': {
          const nRow = document.createElement('div');
          nRow.className = 'numbered-row';
          nRow.innerHTML = `<span class="numbered-icon" contenteditable="false">1.</span><div class="numbered-text" contenteditable="true">List item</div>`;
          richEditor.appendChild(nRow);
          setCursorToEnd(nRow.querySelector('.numbered-text'));
          break;
        }
        case 'checklist':
          insertInteractiveTask();
          updateToolbarState();
          return;
        case 'code': {
          const codeEl = createCodeBlockElement('javascript', '// write code here');
          richEditor.appendChild(codeEl);
          setCursorToEnd(codeEl.querySelector('.code-content'));
          break;
        }
        case 'link':
          openLinkModal();
          return;
        case 'snapshot':
          vscode.postMessage({ type: 'INSERT_CODE_SNAPSHOT' });
          return;
        case 'tag':
          openTagModal();
          return;
      }
      markDirty();
      scheduleAutoSave();
      updateToolbarState();
      return;
    }

    // Raw markdown mode toolbar actions
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = textarea.value.substring(start, end);
    let insertion = '';
    let cursorOffset = 0;

    switch (command) {
      case 'bold':
        insertion = `**${selectedText || 'bold text'}**`;
        cursorOffset = selectedText ? 0 : -2;
        break;
      case 'italic':
        insertion = `*${selectedText || 'italic text'}*`;
        cursorOffset = selectedText ? 0 : -1;
        break;
      case 'heading': {
        const lineStart = textarea.value.lastIndexOf('\n', start - 1) + 1;
        const lineEnd = textarea.value.indexOf('\n', start);
        const currentLine = textarea.value.substring(
          lineStart,
          lineEnd === -1 ? undefined : lineEnd
        );
        const headingMatch = currentLine.match(/^(#{1,6})\s/);
        if (headingMatch) {
          const level = headingMatch[1].length;
          if (level >= 3) {
            const newLine = currentLine.replace(/^#{1,6}\s/, '');
            replaceRange(lineStart, lineEnd === -1 ? textarea.value.length : lineEnd, newLine);
          } else {
            const newLine = '#' + currentLine;
            replaceRange(lineStart, lineEnd === -1 ? textarea.value.length : lineEnd, newLine);
          }
        } else {
          const newLine = '# ' + currentLine;
          replaceRange(lineStart, lineEnd === -1 ? textarea.value.length : lineEnd, newLine);
        }
        markDirty();
        updateToolbarState();
        return;
      }
      case 'unordered-list':
        insertion = `\n- ${selectedText || 'List item'}`;
        break;
      case 'ordered-list':
        insertion = `\n1. ${selectedText || 'List item'}`;
        break;
      case 'checklist': {
        const lineStart = textarea.value.lastIndexOf('\n', start - 1) + 1;
        const lineEnd = textarea.value.indexOf('\n', start);
        const currentLine = textarea.value.substring(
          lineStart,
          lineEnd === -1 ? undefined : lineEnd
        );
        if (currentLine.includes('- [ ] ')) {
          const newLine = currentLine.replace('- [ ] ', '- [x] ');
          replaceRange(lineStart, lineEnd === -1 ? textarea.value.length : lineEnd, newLine);
          markDirty();
          updateTaskStatistics();
          updateToolbarState();
          return;
        } else if (currentLine.includes('- [x] ')) {
          const newLine = currentLine.replace('- [x] ', '- [ ] ');
          replaceRange(lineStart, lineEnd === -1 ? textarea.value.length : lineEnd, newLine);
          markDirty();
          updateTaskStatistics();
          updateToolbarState();
          return;
        } else {
          insertion = `\n- [ ] ${selectedText || 'Task'}`;
        }
        break;
      }
      case 'code':
        if (selectedText.includes('\n')) {
          insertion = `\n\`\`\`\n${selectedText}\n\`\`\`\n`;
        } else {
          insertion = `\`${selectedText || 'code'}\``;
          cursorOffset = selectedText ? 0 : -1;
        }
        break;
      case 'link':
        openLinkModal();
        return;
      case 'snapshot':
        vscode.postMessage({ type: 'INSERT_CODE_SNAPSHOT' });
        return;
      case 'tag':
        openTagModal();
        return;
      default:
        return;
    }

    replaceRange(start, end, insertion);
    const newPos = start + insertion.length + cursorOffset;
    textarea.setSelectionRange(newPos, newPos);
    textarea.focus();
    markDirty();
    updateTaskStatistics();
    updateToolbarState();
  }

  // ─── Toolbar Status Tracking (Active / Selected Indicator) ─

  function updateToolbarState() {
    const boldBtn = document.querySelector('.toolbar-btn[data-command="bold"]');
    const italicBtn = document.querySelector('.toolbar-btn[data-command="italic"]');
    const headingBtn = document.querySelector('.toolbar-btn[data-command="heading"]');
    const unorderedBtn = document.querySelector('.toolbar-btn[data-command="unordered-list"]');
    const orderedBtn = document.querySelector('.toolbar-btn[data-command="ordered-list"]');
    const checklistBtn = document.querySelector('.toolbar-btn[data-command="checklist"]');
    const codeBtn = document.querySelector('.toolbar-btn[data-command="code"]');

    if (viewMode === 'rich') {
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount || !richEditor.contains(sel.anchorNode)) {
        if (boldBtn) boldBtn.classList.remove('active');
        if (italicBtn) italicBtn.classList.remove('active');
        if (headingBtn) headingBtn.classList.remove('active');
        if (unorderedBtn) unorderedBtn.classList.remove('active');
        if (orderedBtn) orderedBtn.classList.remove('active');
        if (checklistBtn) checklistBtn.classList.remove('active');
        if (codeBtn) codeBtn.classList.remove('active');
        return;
      }

      const anchor = sel.anchorNode;
      const el = anchor.nodeType === Node.ELEMENT_NODE ? anchor : anchor.parentElement;

      // Bold
      let isBold = false;
      try {
        isBold = document.queryCommandState('bold');
      } catch {}
      if (!isBold && el) {
        isBold = !!el.closest('strong, b');
      }
      if (boldBtn) boldBtn.classList.toggle('active', !!isBold);

      // Italic
      let isItalic = false;
      try {
        isItalic = document.queryCommandState('italic');
      } catch {}
      if (!isItalic && el) {
        isItalic = !!el.closest('em, i');
      }
      if (italicBtn) italicBtn.classList.toggle('active', !!isItalic);

      // Heading
      const isHeading = el ? !!el.closest('h1, h2, h3, h4, h5, h6, .editor-h1, .editor-h2, .editor-h3, .editor-h4') : false;
      if (headingBtn) headingBtn.classList.toggle('active', !!isHeading);

      // Lists & Code
      const isBullet = el ? !!el.closest('.bullet-row') : false;
      if (unorderedBtn) unorderedBtn.classList.toggle('active', !!isBullet);

      const isNumbered = el ? !!el.closest('.numbered-row') : false;
      if (orderedBtn) orderedBtn.classList.toggle('active', !!isNumbered);

      const isTask = el ? !!el.closest('.task-row') : false;
      if (checklistBtn) checklistBtn.classList.toggle('active', !!isTask);

      const isCode = el ? !!el.closest('.code-block') : false;
      if (codeBtn) codeBtn.classList.toggle('active', !!isCode);
    } else {
      // Raw mode
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = textarea.value;

      const lineStart = text.lastIndexOf('\n', start - 1) + 1;
      const lineEnd = text.indexOf('\n', start);
      const currentLine = text.substring(lineStart, lineEnd === -1 ? undefined : lineEnd);

      if (headingBtn) headingBtn.classList.toggle('active', /^#{1,6}\s/.test(currentLine));
      if (unorderedBtn) unorderedBtn.classList.toggle('active', /^[-*]\s+(?!\[[ xX]\])/.test(currentLine));
      if (orderedBtn) orderedBtn.classList.toggle('active', /^\d+\.\s+/.test(currentLine));
      if (checklistBtn) checklistBtn.classList.toggle('active', /^[-*]\s*\[[ xX]\]/.test(currentLine));

      const selected = text.substring(start, end);
      const isBold = (selected.startsWith('**') && selected.endsWith('**')) ||
        (text.substring(Math.max(0, start - 2), start) === '**' && text.substring(end, end + 2) === '**');
      if (boldBtn) boldBtn.classList.toggle('active', !!isBold);

      const isItalic = (selected.startsWith('*') && selected.endsWith('*') && !isBold) ||
        (text.substring(Math.max(0, start - 1), start) === '*' && text.substring(end, end + 1) === '*');
      if (italicBtn) italicBtn.classList.toggle('active', !!isItalic);

      const before = text.substring(0, start);
      const fenceCount = (before.match(/```/g) || []).length;
      if (codeBtn) codeBtn.classList.toggle('active', fenceCount % 2 === 1);
    }
  }

  // ─── Link & Tag Modal Dialogs ──────────────────────────────

  function saveCurrentSelection() {
    if (viewMode === 'rich') {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        if (richEditor.contains(range.commonAncestorContainer)) {
          savedSelectionRange = range.cloneRange();
          return;
        }
      }
      savedSelectionRange = null;
    } else {
      savedRawSelection = {
        start: textarea.selectionStart,
        end: textarea.selectionEnd,
      };
    }
  }

  function restoreSavedSelection() {
    if (viewMode === 'rich') {
      richEditor.focus();
      if (savedSelectionRange) {
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(savedSelectionRange);
      }
    } else {
      textarea.focus();
      if (savedRawSelection) {
        textarea.setSelectionRange(savedRawSelection.start, savedRawSelection.end);
      }
    }
  }

  function insertHtmlAtSelection(html) {
    richEditor.focus();
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      const template = document.createElement('template');
      template.innerHTML = html;
      const frag = template.content;
      const lastChild = frag.lastChild;
      range.insertNode(frag);
      if (lastChild) {
        const newRange = document.createRange();
        newRange.setStartAfter(lastChild);
        newRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(newRange);
      }
    } else {
      const template = document.createElement('template');
      template.innerHTML = html;
      richEditor.appendChild(template.content);
    }
  }

  function openLinkModal() {
    saveCurrentSelection();
    let selectedText = '';
    if (viewMode === 'rich' && savedSelectionRange) {
      selectedText = savedSelectionRange.toString().trim();
    } else if (viewMode === 'raw' && savedRawSelection) {
      selectedText = textarea.value.substring(savedRawSelection.start, savedRawSelection.end).trim();
    }
    if (modalLinkText) modalLinkText.value = selectedText;
    if (modalLinkUrl) modalLinkUrl.value = '';
    if (modalLinkOverlay) modalLinkOverlay.style.display = 'flex';
    setTimeout(() => {
      if (selectedText && modalLinkUrl) {
        modalLinkUrl.focus();
      } else if (modalLinkText) {
        modalLinkText.focus();
      }
    }, 50);
  }

  function closeLinkModal() {
    if (modalLinkOverlay) modalLinkOverlay.style.display = 'none';
    restoreSavedSelection();
  }

  function submitLinkModal() {
    const text = modalLinkText ? modalLinkText.value.trim() : '';
    let url = modalLinkUrl ? modalLinkUrl.value.trim() : '';
    if (!url) {
      if (modalLinkUrl) modalLinkUrl.focus();
      return;
    }
    if (!/^https?:\/\//i.test(url) && !url.startsWith('#') && !url.startsWith('/') && !url.startsWith('mailto:')) {
      url = 'https://' + url;
    }
    const displayText = text || url;

    if (viewMode === 'rich') {
      restoreSavedSelection();
      const linkHtml = `<a class="editor-link" href="${escapeHtml(url)}" target="_blank" contenteditable="false">${escapeHtml(displayText)}</a>&nbsp;`;
      insertHtmlAtSelection(linkHtml);
    } else {
      restoreSavedSelection();
      const mdLink = `[${displayText}](${url})`;
      const start = savedRawSelection ? savedRawSelection.start : textarea.selectionStart;
      const end = savedRawSelection ? savedRawSelection.end : textarea.selectionEnd;
      replaceRange(start, end, mdLink);
      const newPos = start + mdLink.length;
      textarea.setSelectionRange(newPos, newPos);
      textarea.focus();
    }

    if (modalLinkOverlay) modalLinkOverlay.style.display = 'none';
    markDirty();
    scheduleAutoSave();
    updateToolbarState();
  }

  function openTagModal() {
    saveCurrentSelection();
    if (modalTagName) modalTagName.value = '';
    if (modalTagOverlay) modalTagOverlay.style.display = 'flex';
    setTimeout(() => {
      if (modalTagName) modalTagName.focus();
    }, 50);
  }

  function closeTagModal() {
    if (modalTagOverlay) modalTagOverlay.style.display = 'none';
    restoreSavedSelection();
  }

  function submitTagModal(tagName) {
    let rawTag = tagName || (modalTagName ? modalTagName.value : '');
    let tag = rawTag.trim().replace(/^#+/, '').replace(/\s+/g, '-');
    if (!tag) {
      if (modalTagName) modalTagName.focus();
      return;
    }

    if (viewMode === 'rich') {
      restoreSavedSelection();
      const tagHtml = `<span class="note-tag" contenteditable="false">#${escapeHtml(tag)}</span>&nbsp;`;
      insertHtmlAtSelection(tagHtml);
    } else {
      restoreSavedSelection();
      const mdTag = ` #${tag} `;
      const start = savedRawSelection ? savedRawSelection.start : textarea.selectionStart;
      const end = savedRawSelection ? savedRawSelection.end : textarea.selectionEnd;
      replaceRange(start, end, mdTag);
      const newPos = start + mdTag.length;
      textarea.setSelectionRange(newPos, newPos);
      textarea.focus();
    }

    if (modalTagOverlay) modalTagOverlay.style.display = 'none';
    markDirty();
    scheduleAutoSave();
    updateToolbarState();
  }

  // Modal event wiring
  if (modalLinkText) {
    modalLinkText.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); submitLinkModal(); }
      if (e.key === 'Escape') { e.preventDefault(); closeLinkModal(); }
    });
  }
  if (modalLinkUrl) {
    modalLinkUrl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); submitLinkModal(); }
      if (e.key === 'Escape') { e.preventDefault(); closeLinkModal(); }
    });
  }
  if (modalTagName) {
    modalTagName.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); submitTagModal(); }
      if (e.key === 'Escape') { e.preventDefault(); closeTagModal(); }
    });
  }
  if (modalLinkClose) modalLinkClose.addEventListener('click', closeLinkModal);
  if (modalLinkCancel) modalLinkCancel.addEventListener('click', closeLinkModal);
  if (modalLinkInsert) modalLinkInsert.addEventListener('click', submitLinkModal);
  if (modalTagClose) modalTagClose.addEventListener('click', closeTagModal);
  if (modalTagCancel) modalTagCancel.addEventListener('click', closeTagModal);
  if (modalTagInsert) modalTagInsert.addEventListener('click', () => submitTagModal());
  if (modalLinkOverlay) {
    modalLinkOverlay.addEventListener('click', (e) => {
      if (e.target === modalLinkOverlay) closeLinkModal();
    });
  }
  if (modalTagOverlay) {
    modalTagOverlay.addEventListener('click', (e) => {
      if (e.target === modalTagOverlay) closeTagModal();
    });
  }
  if (modalQuickTags) {
    modalQuickTags.querySelectorAll('.quick-tag-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        const t = chip.getAttribute('data-tag');
        if (t) submitTagModal(t);
      });
    });
  }

  // Rich editor clicks for code block deletion and links
  richEditor.addEventListener('click', (e) => {
    const delBtn = e.target.closest('.code-block-delete-btn');
    if (delBtn) {
      e.preventDefault();
      e.stopPropagation();
      const block = delBtn.closest('.code-block');
      if (block) {
        const prev = block.previousElementSibling;
        const next = block.nextElementSibling;
        block.remove();
        if (richEditor.children.length === 0) {
          const p = document.createElement('p');
          p.className = 'paragraph-block';
          p.innerHTML = '<br>';
          richEditor.appendChild(p);
          setCursorToEnd(p);
        } else if (next) {
          setCursorToEnd(next);
        } else if (prev) {
          setCursorToEnd(prev);
        }
        markDirty();
        scheduleAutoSave();
        updateToolbarState();
      }
      return;
    }

    const link = e.target.closest('.editor-link');
    if (link) {
      e.preventDefault();
      const href = link.getAttribute('href');
      if (href) {
        vscode.postMessage({ type: 'OPEN_LINK', url: href });
      }
    }
  });

  // Selection change listeners for toolbar status
  document.addEventListener('selectionchange', updateToolbarState);
  richEditor.addEventListener('keyup', updateToolbarState);
  richEditor.addEventListener('mouseup', updateToolbarState);
  richEditor.addEventListener('input', updateToolbarState);
  textarea.addEventListener('keyup', updateToolbarState);
  textarea.addEventListener('mouseup', updateToolbarState);
  textarea.addEventListener('input', updateToolbarState);

  function replaceRange(start, end, text) {
    const before = textarea.value.substring(0, start);
    const after = textarea.value.substring(end);
    textarea.value = before + text + after;
  }

  // ─── Keyboard Shortcuts in Raw Textarea ────────────────────

  textarea.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey) {
      switch (e.key.toLowerCase()) {
        case 'b':
          e.preventDefault();
          handleToolbarCommand('bold');
          break;
        case 'i':
          e.preventDefault();
          handleToolbarCommand('italic');
          break;
        case 's':
          e.preventDefault();
          saveNote();
          break;
      }
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      replaceRange(start, end, '  ');
      textarea.setSelectionRange(start + 2, start + 2);
      markDirty();
    }
  });

  textarea.addEventListener('input', () => {
    markDirty();
    updateWordCount();
    updateTaskStatistics();
    scheduleAutoSave();
  });

  // ─── Auto-Save ─────────────────────────────────────────────

  function markDirty() {
    isDirty = true;
    updateSaveStatus('unsaved', '● Modified');
  }

  function scheduleAutoSave() {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      saveNote();
    }, AUTO_SAVE_DELAY);
  }

  function saveNote() {
    if (!isDirty || !currentPath) return;

    updateSaveStatus('saving', '⟳ Saving...');
    const content = getCurrentContent();

    vscode.postMessage({
      type: 'SAVE_NOTE',
      path: currentPath,
      content,
    });
  }

  function updateSaveStatus(state, text) {
    const indicator = statusSave.querySelector('.save-indicator');
    indicator.className = `save-indicator ${state}`;
    indicator.textContent = text;
  }

  // ─── Word Count ────────────────────────────────────────────

  function updateWordCount() {
    const text = viewMode === 'rich' ? richEditor.innerText || '' : textarea.value || '';
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    const chars = text.length;

    statusWords.textContent = `Words: ${words}`;
    statusChars.textContent = `Chars: ${chars}`;
  }

  // ─── Time & Metadata Display ───────────────────────────────

  function updateMetadataDisplay(metadata) {
    if (metadata && metadata.branch && statusBranch) {
      statusBranch.textContent = `🌿 ${metadata.branch}`;
      statusBranch.style.display = 'inline';
    } else if (statusBranch) {
      statusBranch.style.display = 'none';
    }

    if (metadata && metadata.modifiedAt) {
      const date = new Date(metadata.modifiedAt);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMin = Math.floor(diffMs / 60000);

      if (diffMin < 1) {
        statusTime.textContent = 'Just now';
      } else if (diffMin < 60) {
        statusTime.textContent = `${diffMin}m ago`;
      } else if (diffMin < 1440) {
        statusTime.textContent = `${Math.floor(diffMin / 60)}h ago`;
      } else {
        statusTime.textContent = date.toLocaleDateString();
      }
    }
  }

  // ─── Snapshots UI ──────────────────────────────────────────

  function renderSnapshots() {
    if (!snapshotsContainer) return;
    const snapList = Object.values(snapshots);

    if (snapList.length === 0) {
      snapshotsContainer.innerHTML = '';
      snapshotsContainer.style.display = 'none';
      return;
    }

    snapshotsContainer.style.display = 'block';
    let html = '';

    for (const snap of snapList) {
      html += `
        <div class="code-snapshot" id="snapshot-${snap.id}">
          <div class="code-snapshot-header">
            <span>📸 <strong>${escapeHtml(snap.sourceFile)}</strong> : L${snap.startLine}-L${snap.endLine}</span>
            <div style="margin-left: auto; display: flex; gap: 8px;">
              <span class="snapshot-btn btn-jump" data-id="${snap.id}" title="Jump to file in editor">↗ Open Source</span>
              <span class="snapshot-btn btn-drift" data-id="${snap.id}" title="Check if code changed">🔍 Verify</span>
              <span class="snapshot-btn btn-delete" data-id="${snap.id}" title="Delete code snapshot">🗑️ Delete</span>
            </div>
          </div>
          <div class="code-snapshot-body">${escapeHtml(snap.capturedCode)}</div>
          <div class="code-snapshot-footer" id="snap-footer-${snap.id}" style="display: none;">
            <span class="code-snapshot-warning" id="snap-warning-${snap.id}"></span>
            <span class="snapshot-btn btn-update" data-id="${snap.id}" style="margin-left: auto; display: none;">↻ Update Snapshot</span>
          </div>
        </div>
      `;
    }

    snapshotsContainer.innerHTML = html;

    snapshotsContainer.querySelectorAll('.btn-jump').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        vscode.postMessage({ type: 'JUMP_TO_SNAPSHOT', snapshotId: id });
      });
    });

    snapshotsContainer.querySelectorAll('.btn-drift').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        btn.textContent = 'Verifying...';
        vscode.postMessage({ type: 'CHECK_SNAPSHOT_DRIFT', snapshotId: id });
      });
    });

    snapshotsContainer.querySelectorAll('.btn-update').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        vscode.postMessage({ type: 'UPDATE_SNAPSHOT', snapshotId: id });
      });
    });

    snapshotsContainer.querySelectorAll('.btn-delete').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        delete snapshots[id];
        renderSnapshots();
        vscode.postMessage({ type: 'DELETE_SNAPSHOT', snapshotId: id });
      });
    });
  }

  // ─── Extension Message Handling ────────────────────────────

  window.addEventListener('message', (event) => {
    const message = event.data;

    switch (message.type) {
      case 'NOTE_LOADED':
        currentPath = message.path;
        snapshots = message.snapshots || {};
        isDirty = false;

        // Render in Rich View by default
        textarea.value = message.content || '';
        parseMarkdownToRich(message.content || '');

        updateSaveStatus('saved', '✓ Saved');
        updateMetadataDisplay(message.metadata);
        renderSnapshots();
        updateToolbarState();
        break;

      case 'SAVE_CONFIRMED':
        isDirty = false;
        updateSaveStatus('saved', '✓ Saved');
        break;

      case 'CODE_SNAPSHOT_DATA': {
        const snap = message.snapshot;
        snapshots[snap.id] = snap;
        renderSnapshots();

        if (viewMode === 'rich') {
          const codeEl = createCodeBlockElement('SNAPSHOT', `// Snapshot: ${snap.sourceFile}:${snap.startLine}-${snap.endLine}\n${snap.capturedCode}`);
          richEditor.appendChild(codeEl);
        } else {
          const codeBlock = `\n\`\`\`\n// Snapshot: ${snap.sourceFile}:${snap.startLine}-${snap.endLine}\n${snap.capturedCode}\n\`\`\`\n`;
          const pos = textarea.selectionStart;
          replaceRange(pos, pos, codeBlock);
        }

        markDirty();
        scheduleAutoSave();
        updateToolbarState();
        break;
      }

      case 'SNAPSHOT_DRIFT_STATUS': {
        const footer = document.getElementById(`snap-footer-${message.snapshotId}`);
        const warning = document.getElementById(`snap-warning-${message.snapshotId}`);
        const updateBtn = footer ? footer.querySelector('.btn-update') : null;
        const driftBtn = document.querySelector(`.btn-drift[data-id="${message.snapshotId}"]`);

        if (driftBtn) driftBtn.textContent = '🔍 Verify';

        if (footer && warning) {
          footer.style.display = 'flex';
          if (message.hasDrifted) {
            warning.textContent = '⚠️ Code changed in source file since snapshot!';
            if (updateBtn) updateBtn.style.display = 'inline';
          } else {
            warning.textContent = '✅ Code matches source file perfectly.';
            warning.style.color = 'var(--np-success)';
            if (updateBtn) updateBtn.style.display = 'none';
          }
        }
        break;
      }

      case 'SNAPSHOT_UPDATED': {
        const updated = message.snapshot;
        snapshots[updated.id] = updated;
        renderSnapshots();
        break;
      }

      case 'SNAPSHOT_DELETED': {
        delete snapshots[message.snapshotId];
        renderSnapshots();
        break;
      }

      case 'ERROR':
        updateSaveStatus('unsaved', '✕ Error');
        console.error('[NotePad Editor]', message.message);
        break;
    }
  });

  // ─── Initialize ─────────────────────────────────────────────
  vscode.postMessage({ type: 'EDITOR_READY' });
})();
