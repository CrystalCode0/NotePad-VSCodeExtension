# 📝 NotePad — Developer Notes for VS Code

[![Version](https://img.shields.io/badge/version-0.1.0-blue.svg)](https://github.com/CrystalCode0/NotePad-VSCodeExtension)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![VS Code](https://img.shields.io/badge/VS%20Code-^1.85.0-007ACC.svg)](https://code.visualstudio.com/)

**NotePad** is a fast, code-aware notes manager built directly into VS Code. Keep your notes, architecture decisions, meeting minutes, and snippets organized right inside your project repository under `.notes/` — zero external accounts required.

---

## ✨ Why NotePad?

Most notepad extensions are basic text areas. **NotePad** is purpose-built for engineers:

| Feature | Description |
|---|---|
| 📸 **Code Snapshots** | Capture code selections with live file, line range, and change detection |
| 📋 **Built-in Templates** | Meeting notes, ADRs, Bug reports, Standups, Code reviews, Spike logs |
| 🏷️ **Smart Tags** | Automatic `#tag` extraction, indexation, and interactive filtering |
| 🔍 **Full-Text Search** | Instant searching across note titles and contents with matching snippets |
| 📅 **Timeline View** | Temporal buckets (Today, Yesterday, This Week, Older) |
| 🌿 **Git Branch Context** | Notes automatically track active branch and workspace state |
| ⚡ **Quick Capture** | `Ctrl+Shift+N` to instantly capture developer thoughts without breaking flow |
| 📁 **Local `.notes/` Storage** | Plain Markdown files saved right in your workspace root |

---

## 🚀 Key Features

### 1. 📁 Folder & Note Explorer (Sidebar)
- Dedicated NotePad icon in the VS Code Activity Bar.
- Multi-level folders with inline create, rename, delete, and drag-and-drop.
- Pin your most important notes to the top for 1-click access.
- Native VS Code theme matching (Dark, Light, High Contrast).

### 2. 📝 Rich Markdown Note Editor
- Formatting toolbar: Bold, Italic, Headings (H1–H3), Lists, Checkboxes, Code Blocks, and Links.
- Interactive checkboxes (`- [ ]` / `- [x]`).
- Debounced auto-save (never lose a thought).
- Real-time word and character counter.
- Active Git branch badge.

### 3. 📸 Code Snapshots (Live Code Links)
- Select code in any editor tab → click 📸 in NotePad.
- NotePad embeds an interactive snapshot referencing the file, start line, and end line.
- Click **"Open Source"** to jump directly to that exact line in the source file.
- Click **"Verify"** to detect if the source code has drifted since the note was taken.

### 4. 📋 Developer Note Templates
Start notes with standardized structure in 1 click:
- **Meeting Notes** (`meeting-notes.md`)
- **Bug Investigation** (`bug-report.md`)
- **Daily Standup** (`daily-standup.md`)
- **Architecture Decision Record** (`architecture-decision.md`)
- **Code Review** (`code-review.md`)
- **Spike / Experiment Log** (`experiment-log.md`)
- Also supports custom templates placed in `.notes/.templates/`!

### 5. 🏷️ Smart Tags & Search
- Type `#tags` anywhere in your notes (e.g. `#urgent`, `#backend`, `#bug-402`).
- Tags are automatically extracted and grouped into the Tag Cloud in the sidebar.
- Click any tag to instantly filter your notes tree.
- Full-text search with highlight snippets.

### 6. 🧘 Focus Mode & Pomodoro Timer
- Toggle Focus Mode via Command Palette (`NotePad: Toggle Focus Mode`).
- Runs an integrated 25-minute Pomodoro focus timer with notification alerts.

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Command |
|---|---|
| `Ctrl+Shift+N` (`Cmd+Shift+N` on Mac) | Quick Capture Note |
| `Ctrl+Alt+N` (`Cmd+Alt+N` on Mac) | Create New Note |
| `Ctrl+B` (inside NotePad editor) | Toggle Bold formatting |
| `Ctrl+I` (inside NotePad editor) | Toggle Italic formatting |
| `Ctrl+S` (inside NotePad editor) | Save Note immediately |

---

## ⚙️ Extension Settings

| Setting | Default | Description |
|---|---|---|
| `notepad.autoSaveDelay` | `1000` | Auto-save delay in milliseconds after last keystroke |
| `notepad.defaultNoteFormat` | `"md"` | Default file format for new notes (`md` or `txt`) |
| `notepad.showGitBranch` | `true` | Auto-tag notes with active Git branch |
| `notepad.quickCaptureFolder` | `"Quick Notes"` | Folder name for quick capture notes |

---

## 📁 Repository Structure (`.notes/`)

All data is stored locally in `.notes/` at the root of your workspace:

```text
my-project/
├── .notes/
│   ├── .notesconfig.json      # Metadata, pins, tags, and snapshots
│   ├── Architecture/
│   │   └── database-migration.md
│   ├── Meetings/
│   │   └── 2026-09-28-sprint-planning.md
│   └── Quick Notes/
│       └── 2026-09-28-1530.md
```

> [!TIP]
> NotePad will automatically prompt you on first activation to add `.notes/` to your `.gitignore` if you prefer to keep your personal notes private.

---

## 🧪 Testing & Verification

Run the built-in test suite:
```bash
npm test
```
All 7 service test suites run and validate file CRUD, configuration persistence, tag parsing, full-text search, and temporal grouping.

---

## 📄 License

MIT © CrystalCode0
