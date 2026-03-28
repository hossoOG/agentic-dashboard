# AgenticExplorer

Desktop-App zum Verwalten und Ueberwachen von Claude CLI Sessions. Multi-Session-Terminal mit Projekt-Kontext (CLAUDE.md, Skills, Hooks, GitHub), Favoriten-System und Notizen.

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite, Zustand, Tailwind CSS, Framer Motion
- **Backend**: Tauri v2, Rust
- **Terminal**: xterm.js mit PTY-Sessions

## Voraussetzungen

- [Node.js](https://nodejs.org/) (v18+)
- [Rust](https://rustup.rs/) (stable)
- [Tauri v2 Prerequisites](https://v2.tauri.app/start/prerequisites/)
- [Claude CLI](https://docs.anthropic.com/en/docs/claude-cli) installiert und konfiguriert

## Setup

```bash
npm install
```

## Entwicklung

```bash
npm run tauri dev
```

Startet die Desktop-App im Entwicklungsmodus (Vite Dev-Server + Tauri).

## Build

```bash
npm run tauri build
```

Erstellt einen produktionsfertigen Desktop-Build (Frontend + Rust).

## Weitere Befehle

```bash
npm run dev          # Nur Vite Dev-Server (Port 5173, ohne Tauri)
npm run build        # Nur Frontend-Build (TypeScript-Check + Vite)
npx tsc --noEmit     # Type-Checking ohne Build
```

## Lizenz

Proprietaer. Alle Rechte vorbehalten.
