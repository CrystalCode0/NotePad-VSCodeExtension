# Changelog

All notable changes to the **NotePad** extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] - 2026-09-29

### Fixed & Enhanced
- **Code Snapshots**:
  - Fixed active editor reference loss when clicking the webview toolbar snapshot button.
  - Fixed false drift detection on Windows caused by CRLF vs LF line endings.
  - Implemented dynamic line-shift tracking so code shifted by edits elsewhere in the source file remains verified intact and jumps to exact live line ranges.
  - Added current-line fallback to snapshot single lines when no text is explicitly highlighted.
  - Added right-click editor context menu option (`NotePad: Insert Code Snapshot`) and global keybinding (`Ctrl+Alt+S` / `Cmd+Alt+S`).
  - Added line number gutter to interactive snapshot cards in the note editor.
  - Added automatic note opening and focus upon capturing snapshots via shortcut or command palette.

## [0.1.0] - 2026-09-28

### Added
- **Core Architecture & Storage**:
  - Local repository-based note storage under `.notes/` directory.
  - Automatic `.gitignore` detection and update prompt.
  - File system watcher reflecting external changes automatically.
- **Sidebar UI & Activity Bar**:
  - Dedicated Activity Bar icon and custom themed WebviewViewProvider.
  - Multi-level folder tree with inline creation, renaming, and deletion.
  - Drag-and-drop organization for moving notes and folders.
  - Pinned notes section for one-click access.
  - Sort order switching (A-Z, Z-A).
- **Rich Note Editor**:
  - WebviewPanel rich editor with formatting toolbar (Bold, Italic, Headings, Lists, Checkboxes, Code, Links).
  - Debounced auto-save (1s default) with visual indicators.
  - Word and character count live metrics.
  - Active Git branch badge.
- **Differentiators & Idiosyncratic Features**:
  - **Code Snapshots**: Capture active code selections with file, line ranges, and SHA-256 hash. Includes "Open Source" jump navigation and code drift detection.
  - **Developer Templates**: 6 built-in templates (Meeting Notes, Bug Investigation, Daily Standup, ADR, Code Review, Spike Log) with variable interpolation and custom template support.
  - **Smart Tags**: Automatic inline `#tag` extraction, indexed into `.notesconfig.json`, with Tag Cloud filtering.
  - **Full-Text Search**: Live search across note titles and content with contextual snippets.
  - **Timeline View**: Temporal grouping of notes into Today, Yesterday, This Week, and Older buckets.
  - **Quick Capture**: Global shortcut (`Ctrl+Shift+N`) to instantly save developer thoughts.
  - **Focus Mode**: Distraction-free mode with an integrated 25-minute Pomodoro session.
- **Quality Assurance**:
  - Comprehensive 7-phase automated test suite running with `npm test`.
  - Zero TypeScript errors and optimized bundle under 75KB via esbuild.
