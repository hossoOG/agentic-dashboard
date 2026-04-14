---
schemaVersion: 1
projectName: agentic-dashboard
projectSlug: agentic-dashboard
language: de

# Git
mainBranch: master
defaultRemote: origin
branchNaming:
  feature:  "feat/issue-{nr}-{slug}"
  bugfix:   "fix/issue-{nr}-{slug}"
  chore:    "chore/issue-{nr}-{slug}"
  refactor: "refactor/issue-{nr}-{slug}"
  test:     "test/issue-{nr}-{slug}"
repoOwner: hossoOG
repoName: agentic-dashboard
repoUrl: https://github.com/hossoOG/agentic-dashboard

# Stack identity (treibt conditional Security-Checklisten)
stackTags: [tauri, rust, react, typescript, zustand, tailwind, vitest]

# Runnable commands
commands:
  install:    "npm ci --prefer-offline"
  dev:        "npm run dev"
  test:       "npm run test"
  testSingle: "npx vitest run {file}"
  lint:       "npm run lint"
  typecheck:  "npx tsc --noEmit"
  build:      "npm run build"
  secondary:
    - name: cargo-check
      run:  "cd src-tauri && cargo check --target-dir=../target-c"
      trigger: "*.rs"
    - name: cargo-clippy
      run:  "cd src-tauri && cargo clippy -- -D warnings"
      trigger: "*.rs"

# Paths
paths:
  source:        "src"
  backend:       "src-tauri/src"
  lessonsFile:   "tasks/lessons.md"
  tasksDir:      "tasks"
  worktreesDir:  ".claude/worktrees"
  worktreeNameTemplate: "issue-{nr}"
  plansDir:      "reports"
  architectureFile: "Softwareprozess/arc42-specification.md"

# Release
versionFiles:
  - { path: "package.json",               pattern: '"version": "{VERSION}"' }
  - { path: "src-tauri/tauri.conf.json",  pattern: '"version": "{VERSION}"' }
  - { path: "src-tauri/Cargo.toml",       pattern: 'version = "{VERSION}"' }
changelogFile: "CHANGELOG.md"
archiveDir:    "Softwareprozess/history"

# Security checklists (IDs aus ~/.claude/knowledge/security/)
securityChecklists:
  - tauri-5-questions
  - frontend-xss-dompurify
  - generic-owasp

# Frontend review
frontendReview:
  devServerUrl:      "http://localhost:5173"
  devServerStartCmd: "npm run dev"
  personas: [ux, design, a11y, perf, copy]
  navPlan: [Sessions, Pipeline, Kanban, Library, Editor, Logs, Settings]

# Worktree
worktree:
  maxActive: 6
  requireCleanMain: true
  postCreate:
    - "npm ci --prefer-offline"

# GitHub Integration
# Run /sync-labels to seed all canonical labels into this repo.
# After creating the global board, fill in both fields below and re-run /sync-labels
# to auto-generate .github/workflows/add-to-project.yml.
projectBoardNumber: 4
projectBoardUrl: "https://github.com/users/hossoOG/projects/4"
---

# Project Context — Agentic Dashboard

Tauri v2 + React 18 Desktop-App zum Verwalten und Überwachen von Claude CLI Sessions.
Zustand für State-Management, Tailwind für UI, Vitest + jsdom für Tests,
Rust Commands in `src-tauri/src/lib.rs` innerhalb `mod commands {}`.

## Projekt-spezifische Konventionen

- Tauri Commands MÜSSEN im `mod commands {}` Block in `lib.rs` liegen (rustc E0255 Workaround)
- Zustand: Ausschließlich granulare Selektoren — **niemals** `const { a, b } = useStore()`
- Windows-spezifisch: Jedes `Command::new` braucht `CREATE_NO_WINDOW` Flag (kein Konsolen-Popup)
- Optional Chaining (`?.`) und Nullish Coalescing (`??`) bei allen Tauri-Events und Store-Zugriffen
- Tailwind: Utility Classes — Custom CSS nur in `index.css`, sonst nirgends
- Tauri v2 API-Imports aus `@tauri-apps/api` (nicht v1 Pfade)
- `--target-dir=../target-c` bei cargo-check im Worktree ist PFLICHT (Windows MAX_PATH + Lock-Konflikte)

## Architektur-Überblick

Frontend: React 18 + Zustand Stores unter `src/store/*.ts`, Komponenten unter `src/components/`
Backend: Rust/Tauri Commands in `src-tauri/src/lib.rs` → `mod commands {}`, Helpers in separaten Modulen
IPC-Layer: Tauri `invoke()` im Frontend, `#[tauri::command]` + `app.invoke_handler()` im Backend
Terminal: xterm.js in `src/components/sessions/SessionTerminal.tsx`
Editor: CodeMirror in `src/components/editor/`
