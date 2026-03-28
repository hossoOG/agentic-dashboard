# Contributing to AgenticExplorer

Thanks for your interest in contributing! This guide will help you get started.

## Development Setup

1. Install [prerequisites](#prerequisites)
2. Fork and clone the repository
3. Run `npm install`
4. Start the dev environment with `npm run tauri dev`

### Prerequisites

- [Node.js](https://nodejs.org/) v18+
- [Rust](https://rustup.rs/) (stable)
- [Tauri v2 Prerequisites](https://v2.tauri.app/start/prerequisites/)

## How to Contribute

### Reporting Bugs

- Open a [GitHub Issue](https://github.com/hossoOG/agentic-dashboard/issues/new)
- Include steps to reproduce, expected vs. actual behavior
- Mention your OS and app version

### Suggesting Features

- Open a [GitHub Issue](https://github.com/hossoOG/agentic-dashboard/issues/new) with the `enhancement` label
- Describe the use case and why it would be helpful

### Pull Requests

1. Fork the repo and create a branch from `master`
2. Make your changes
3. Ensure the build passes:
   ```bash
   npx tsc --noEmit    # TypeScript check
   npm run build        # Frontend build
   cd src-tauri && cargo check  # Rust check
   ```
4. Open a PR with a clear description of what you changed and why

## Code Style

### Commits

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(ui): add dark mode toggle
fix(store): prevent session state leak on close
chore(config): update Tauri plugin versions
```

**Scopes**: `ui`, `store`, `parser`, `tauri`, `config`

### Frontend (TypeScript/React)

- Functional components with hooks (no class components)
- State management with Zustand
- Tailwind CSS utility classes for styling
- Custom CSS only for animations and 3D transforms

### Backend (Rust)

- Tauri v2 commands and plugins
- Follow standard Rust formatting (`cargo fmt`)

## Project Structure

```
src/                    # React frontend
  components/           # UI components
  store/                # Zustand stores
  protocols/            # Protocol schemas
src-tauri/              # Rust backend
  src/
    session/            # PTY session management
    lib.rs              # Tauri commands
```

## Questions?

Open an issue or start a discussion — we're happy to help!
