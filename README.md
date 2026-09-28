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

## 📖 How to Use (Step-by-Step Guide)

### 1. Installation from `.vsix`

Download the latest `.vsix` package from the [Releases](https://github.com/CrystalCode0/NotePad-VSCodeExtension/releases) page and install it using any of the following methods:

#### Option A: Install via VS Code UI (Recommended)
1. Download the `notepad-vscode-*.vsix` file from [GitHub Releases](https://github.com/CrystalCode0/NotePad-VSCodeExtension/releases).
2. Open **VS Code**.
3. Open the **Extensions** view by clicking the Extensions icon on the Activity Bar or pressing `Ctrl+Shift+X` (`Cmd+Shift+X` on macOS).
4. Click the **`···` (Views and More Actions)** menu icon at the top-right corner of the Extensions view header.
5. Select **Install from VSIX...** from the dropdown menu.
6. Browse to the downloaded `.vsix` file and click **Install**.
7. Once installed, NotePad will appear in your Activity Bar.

#### Option B: Drag and Drop
1. Open VS Code and open the **Extensions** view (`Ctrl+Shift+X` or `Cmd+Shift+X`).
2. Drag the downloaded `.vsix` file from your file manager (File Explorer on Windows or Finder on macOS) and drop it directly onto the Extensions sidebar panel in VS Code.

#### Option C: Install via Terminal / Command Line
Run the following command in your terminal:
```bash
code --install-extension notepad-vscode-0.1.0.vsix
```
*(Replace `notepad-vscode-0.1.0.vsix` with the path to your downloaded file).*

---

### 2. Getting Started (First Launch)
1. Open any workspace or project folder (`File > Open Folder...`).
2. Click the **NotePad 📝** icon in the **Activity Bar** (left sidebar).
3. On first launch, NotePad automatically creates a `.notes/` folder in your workspace root.
4. NotePad will prompt you asking if you'd like to add `.notes/` to your `.gitignore` to keep personal notes private—click **Yes** if you prefer not to commit notes to your git repository.

### 3. Creating & Organizing Notes
- **Create a Note**: Click the **📝+** button in the sidebar header or press `Ctrl+Alt+N` (`Cmd+Alt+N` on macOS). Enter a title and start typing.
- **Create a Folder**: Click the **📁+** button in the sidebar header to create folders and organize notes (e.g., `Architecture`, `Meetings`, `Bugs`).
- **Drag & Drop**: Reorder and organize notes and folders by dragging them within the tree.
- **Context Menu**: Right-click any note or folder to **Rename**, **Delete**, **Pin / Unpin**, or create notes/folders directly inside that directory.
- **Pin Important Notes**: Click **⭐ Pin** to keep your highest-priority notes anchored at the top in the **Pinned Notes** section.

### 4. Writing in the Rich Editor
Click any note from the sidebar to open the editor tab:
- **Two Editor Modes**:
  - **✨ Interactive Mode**: Visual rich text editor with interactive, clickable task checkboxes (`- [ ]` to `- [x]`).
  - **📝 Source Mode**: View and edit the raw Markdown source.
- **Formatting Toolbar**: Quick-access buttons for **Bold** (`Ctrl+B`), **Italic** (`Ctrl+I`), **Headings (H1–H3)**, **Bullet Lists**, **Numbered Lists**, **Task Lists** (`Ctrl+Shift+C`), **Code Blocks**, and **Hyperlinks**.
- **Auto-Save**: Changes save automatically in the background (configured via `notepad.autoSaveDelay`), or press `Ctrl+S` to save immediately.
- **Status Bar**: Live stats at the bottom of the editor show word count, character count, interactive task progress bar (`Tasks: 2/5`), active Git branch, and last saved time.

### 5. Capturing Live Code Snapshots
Reference code without copying and pasting stale snippets:
1. Open any source code file in your workspace and highlight/select the lines you want to snapshot.
2. In your NotePad note, click the **📸 Snapshot** button in the toolbar (or run `NotePad: Insert Code Snapshot` from the Command Palette).
3. NotePad embeds an interactive snapshot card containing the file name, line range, and syntax-highlighted code.
4. **Interactive controls on snapshots**:
   - **Open Source**: Jumps directly to that exact file and line range in the editor.
   - **Verify**: Checks if the source file has been modified or drifted since the snapshot was taken.
   - **Update**: Synchronizes the snapshot code to match current file contents.

### 6. Quick Capture on the Fly (`Ctrl+Shift+N`)
Capture thoughts, bug ideas, or quick snippets without switching tabs or breaking your workflow:
1. Press `Ctrl+Shift+N` (`Cmd+Shift+N` on macOS) anywhere in VS Code.
2. Type your thought into the prompt (e.g., `Fix race condition in auth token refresh #urgent`).
3. Press Enter — NotePad creates a timestamped note inside your `.notes/Quick Notes/` folder and indexes any `#tags` automatically.

### 7. Using Built-in Templates
Kickstart structured notes with 1 click:
1. Click the **📋 Template** icon in the sidebar header or run `NotePad: New Note from Template` in `Ctrl+Shift+P`.
2. Select from the built-in templates:
   - **Meeting Notes** (`meeting-notes.md`) — Agenda, attendees, notes, and action items.
   - **Bug Investigation** (`bug-report.md`) — Symptoms, reproduction steps, root cause, and fix.
   - **Daily Standup** (`daily-standup.md`) — Yesterday, today, blockers.
   - **Architecture Decision Record (ADR)** (`architecture-decision.md`) — Context, decision, consequences.
   - **Code Review** (`code-review.md`) — Summary, checklist, feedback items.
   - **Spike / Experiment Log** (`experiment-log.md`) — Hypothesis, setup, results, next steps.
3. *Custom Templates:* You can drop custom `.md` templates into `.notes/.templates/` and they will automatically show up in the template selector!

### 8. Smart Tags, Search & Timeline
- **🏷️ #Tags**: Add `#tag` anywhere in your note text (e.g., `#api`, `#refactor`, `#todo`). NotePad indexes them in real-time and displays them in the **Smart Tags** cloud. Click any tag to filter your notes tree.
- **🔍 Full-Text Search**: Click the **🔍** icon in the sidebar or run `NotePad: Search Notes` (`Ctrl+Shift+P`) to search across all note titles and body content with highlighted snippets.
- **📅 Timeline View**: Click the **📅** icon in the sidebar header to switch to a chronological view grouping notes by *Today*, *Yesterday*, *This Week*, and *Older*.

### 9. Focus Mode & Pomodoro Timer
1. Open the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`).
2. Run `NotePad: Toggle Focus Mode`.
3. A 25-minute Pomodoro session starts to help you stay locked into your work, alerting you when it's time for a break. Run the command again to exit early.

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
