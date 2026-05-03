---
marp: true
theme: default
paginate: true
size: 16:9
header: 'Bug-Analyse · AgenticExplorer · 2026-04-23'
footer: 'Phase 1 Report · GitHub-Optionen in Config-View'
style: |
  section {
    font-size: 22px;
    padding: 44px 56px 56px 56px;
    font-family: -apple-system, "Segoe UI", Inter, sans-serif;
    background: #fafafa;
    color: #1a1a1a;
  }
  h1 { font-size: 32px; color: #0b5ed7; margin: 0 0 14px 0; }
  h2 { font-size: 26px; color: #0b5ed7; margin: 0 0 12px 0; }
  h3 { font-size: 22px; color: #333; margin: 8px 0 6px 0; }
  p, li { line-height: 1.38; margin: 4px 0; }
  ul, ol { padding-left: 22px; margin: 6px 0; }
  code { font-size: 16px; background: #e9ecef; padding: 1px 5px; border-radius: 3px; }
  pre { font-size: 15px; line-height: 1.35; background: #1e1e1e; color: #e6e6e6; padding: 10px 14px; border-radius: 4px; overflow: hidden; }
  pre code { background: transparent; color: inherit; padding: 0; font-size: 15px; }
  table { font-size: 19px; border-collapse: collapse; margin: 8px 0; }
  th, td { padding: 5px 10px; border: 1px solid #ccc; }
  th { background: #e9ecef; text-align: left; }
  blockquote { font-size: 21px; border-left: 3px solid #0b5ed7; padding: 4px 12px; color: #333; background: #eef4ff; margin: 8px 0; }
  strong { color: #0b3b8a; }
  header, footer { font-size: 12px; color: #6c757d; }
  .cols2 { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
  .small { font-size: 18px; color: #555; }
  .tag { display: inline-block; font-size: 14px; padding: 2px 8px; background: #dbeafe; color: #0b3b8a; border-radius: 10px; margin-right: 6px; }
---

# Bug-Analyse: GitHub-Optionen in Config-View

**Projekt:** AgenticExplorer (Tauri v2 + React 18)
**Branch:** master · **Stand:** 2026-04-23
**Phase:** 1 von 3 — Analyse & Report

<span class="tag">Multi-Agent</span>
<span class="tag">Ultrathink</span>
<span class="tag">30 Slides</span>
<span class="tag">Root-Cause gefunden</span>

**Aufgabe des Users:**
> "Wir wollen bei Projekten, welche kein GitHub initiiert haben, auch in der Konfig-Ansicht nicht die Optionen sehen."

**Ergebnis dieser Phase:** Bug präzise lokalisiert, Fix-Strategie entworfen, bereit für User-Review.

---

## Executive Summary

- **Bug:** Tabs "GitHub", "Worktrees", "Kanban" im Config-Panel werden **immer** angezeigt — auch wenn Projekt kein `.git` oder kein GitHub-Remote hat.
- **Ursache (präzise):** `CONFIG_TABS` in `configPanelShared.tsx:31-41` — Tabs der Gruppe `project` haben **kein** `requiresPresence`-Feld, im Gegensatz zu `context`-Gruppe.
- **Architektur-Status:** Filter-System existiert bereits (`visibleTabs` in `ConfigPanelTabList.tsx:129-133`), muss nur erweitert werden.
- **Fix-Scope:** 1 neues Frontend-Feld + 1 neuer Backend-Command + 1 Presence-Check → ca. 80–120 Zeilen.
- **Risiko:** Niedrig. Additive Änderung, das Pattern ist schon etabliert.
- **Empfehlung:** Phase 2 freigeben und Fix-Agent-Team starten.

---

## Agenda

| # | Kapitel | Slides |
|---|---------|--------|
| 1 | Kontext — App, Tech-Stack, Architektur | 4–6 |
| 2 | Das Problem — User-Intent & Reproduktion | 7–9 |
| 3 | Frontend-Codebasis — Config-Panel-Kette | 10–15 |
| 4 | GitHubViewer — interne Logik | 16–17 |
| 5 | Datenmodell — Stores & Typen | 18–20 |
| 6 | Rust-Backend — Commands & Detection | 21–23 |
| 7 | Root-Cause + Fix-Strategie | 24–28 |
| 8 | Impact, Tests, Next Steps | 29–30 |

---

## 1 · Kontext — Was ist AgenticExplorer?

- **Desktop-App** zum Verwalten und Überwachen von **Claude CLI Sessions**.
- **Multi-Session-Terminal** mit Projekt-Kontext, Favoriten-System, Notizen.
- **Pro Projekt:** Eigenes PTY, eigene Terminal-Instanz, eigene Config-Ansicht.
- **Feature-Freeze** ab v1.6.0: Session Manager ist feature-complete, nur Bugfixes.
- **Aktuelle Version (master):** `c759b2b` (Kanban v2 + Bugfix-Sprint, 2026-04-XX).

**Einordnung des Bugs:** Bugfix-Klasse — UX-Politur in einer reifen Codebasis. Nicht feature-blockierend, aber in der Bedienung störend.

<span class="small">Quelle: `CLAUDE.md`, Git-Log, Projekt-README</span>

---

## 2 · Tech-Stack

| Schicht | Technologien |
|---------|--------------|
| **Frontend** | React 18 + TypeScript + Vite |
| **State** | Zustand (sessionStore, settingsStore, uiStore, projectStore, projectConfigStore) |
| **Styling** | Tailwind CSS + Framer Motion |
| **Terminal** | xterm.js |
| **Backend** | Tauri v2 + Rust (async) |
| **PTY** | `portable-pty` für Shell-Sessions |
| **GitHub** | `gh` CLI (shell-out, kein HTTP-Client) |
| **Git** | `git` CLI (shell-out) |

**Relevanz für diesen Bug:** Die Config-View ist rein im **Frontend**; der Bug-Fix wird ebenfalls vorrangig Frontend-Änderungen brauchen, plus einen neuen Tauri-Command für saubere Detection.

---

## 3 · Architektur — Datenfluss der Config-View

```
User wählt Folder/Session (SessionManagerView)
        │
        ▼
ConfigPanel (src/components/sessions/ConfigPanel.tsx)
        │   liest uiStore.configSubTab
        ├─► ConfigPanelTabList  ── rendert Tab-Buttons
        │       └─► Presence-Detection (Promise.all + invoke)
        │       └─► visibleTabs = CONFIG_TABS.filter(...)
        │
        └─► ConfigPanelContent (Suspense + lazy)
                └─► GitHubViewer | SkillsViewer | KanbanBoard | …
                        └─► invoke("get_git_info", …) — Rust-Backend
                                └─► gh CLI / git CLI
```

<span class="small">Der Bug sitzt genau zwischen **Tab-Liste** und **Presence-Detection** — die Detection wird für `project`-Group-Tabs nie konsultiert.</span>

---

## 4 · Das Problem — User-Intent

> **User-Originalformulierung (2026-04-23):**
> „Wir wollen bei Projekten, welche kein GitHub initiiert haben, auch in der Konfig-Ansicht nicht die Optionen sehen."

**Übersetzung in konkrete UX-Anforderung:**

- Projekte **ohne** `.git`-Ordner → Tabs "GitHub", "Worktrees", "Kanban" ausblenden.
- Projekte **mit** `.git` aber **ohne** GitHub-Remote → Tabs "GitHub" und "Kanban" ausblenden, "Worktrees" weiterhin sichtbar.
- Projekte **mit** GitHub-Remote → alles wie heute.
- **Keine** Tote-Klicks mehr, bei denen erst *nach* Klick die Meldung "Kein Git-Repository" erscheint.

Diese Trennung wird im Fix abgebildet als zwei Presence-Keys: `git` (hat `.git`) und `github` (hat Remote zu github.com).

---

## 5 · Erwartetes vs. aktuelles Verhalten

| Szenario | Aktuell (Bug) | Gewünscht |
|----------|---------------|-----------|
| Projekt **ohne** `.git` | Tabs GitHub, Worktrees, Kanban sichtbar, Klick → Fehler | Tabs **nicht** sichtbar |
| Projekt **mit** `.git`, **ohne** Remote | Alle 3 Tabs sichtbar, GitHub zeigt "gh CLI"-Fehler oder leer | Worktrees sichtbar, GitHub & Kanban **nicht** |
| Projekt **mit** GitHub-Remote | Alle sichtbar, funktionieren | Alle sichtbar (wie heute) |
| Non-Git-Ordner (z.B. `Downloads/`) | GitHub-Tab klickbar, zeigt Fehler | GitHub-Tab **nicht** sichtbar |

**Fazit:** In der ersten Zeile klickt der User ins Leere. Das ist der eigentliche Schmerz, der zum Bug-Report geführt hat.

---

## 6 · Reproduktions-Szenario

1. Starte AgenticExplorer (`npm run tauri dev`).
2. Öffne einen Ordner **ohne Git**, z.B. `C:\Temp\testfolder` (neu angelegt, `.git` nicht vorhanden).
3. Wechsle in die Session-Ansicht, klicke rechts auf das Config-Panel.
4. **Beobachtung:** In der Tab-Leiste erscheinen **GitHub / Worktrees / Kanban**, obwohl das Projekt keinerlei Git-Bezug hat.
5. Klick auf "GitHub" → GitHubViewer rendert → `get_git_info` wirft Fehler → Anzeige "Kein Git-Repository" (`GitHubViewer.tsx:172-180`).
6. Gleicher Effekt bei "Kanban" (wirft bei `list_user_projects` Fehler) und "Worktrees".

**Reliability:** Deterministisch, 100 % reproduzierbar bei jedem Nicht-Git-Ordner.

---

## 7 · Codebasis — relevante Dateien

| Datei | Rolle | Bug-Relevanz |
|-------|-------|--------------|
| `src/components/sessions/ConfigPanel.tsx` | Wrapper (Header + Tab-Liste + Content) | Low — nur Rendering |
| `src/components/sessions/configPanelShared.tsx` | Definition `CONFIG_TABS` + Content-Router | **🎯 HIGH — hier fehlt `requiresPresence`** |
| `src/components/sessions/ConfigPanelTabList.tsx` | Rendert Tab-Buttons, hält Presence-State | **🎯 HIGH — Detection muss erweitert werden** |
| `src/components/sessions/GitHubViewer.tsx` | Rendert GitHub-Inhalt (PRs, Issues) | Mid — internes Error-Rendering reagiert bereits korrekt |
| `src-tauri/src/github/commands.rs` | Tauri-Commands `get_git_info`, `get_github_prs`, … | Mid — neuer `check_project_presence`-Command nötig |
| `src/store/uiStore.ts` | `configSubTab`, `setConfigSubTab` | Low — nur State |

---

## 8 · `ConfigPanel.tsx` — Wrapper

```tsx
export function ConfigPanel({ folder, width, onResumeSession, onClose }) {
  const configSubTab = useUIStore((s) => s.configSubTab);
  return (
    <div className="border-l …" style={{ width: width ?? 400 }}>
      <div className="flex items-center h-9 …">
        <ConfigPanelTabList folder={folder} size="md" />   {/* ← Tab-Leiste */}
        <button onClick={onClose}><X /></button>
      </div>
      <div className="flex-1 min-h-0 overflow-auto">
        <ConfigPanelContent folder={folder} activeTab={configSubTab} … />
      </div>
    </div>
  );
}
```

- Reiner Layout-Wrapper, keine eigene Tab-Logik.
- Delegiert Tab-Rendering an `ConfigPanelTabList`, Content-Rendering an `ConfigPanelContent`.
- **Kein direkter Bug-Beitrag**, aber Einstiegspunkt der Analyse.

<span class="small">Quelle: `src/components/sessions/ConfigPanel.tsx:13-43`</span>

---

## 9 · `configPanelShared.tsx` — CONFIG_TABS (gekürzt)

```ts
export const CONFIG_TABS: ConfigTab[] = [
  { id: "claude-md", label: "CLAUDE.md", group: "context", requiresPresence: "claudeMd" },
  { id: "skills",    label: "Skills",    group: "context", requiresPresence: "skills"   },
  { id: "hooks",     label: "Hooks",     group: "context", requiresPresence: "hooks"    },
  { id: "settings",  label: "Settings",  group: "context", requiresPresence: "settings" },
  { id: "agents",    label: "Agents",    group: "context", requiresPresence: "agents"   },
  { id: "github",    label: "GitHub",    group: "project"                                },
  { id: "worktrees", label: "Worktrees", group: "project"                                },
  { id: "kanban",    label: "Kanban",    group: "project"                                },
  { id: "history",   label: "History",   group: "history"                                },
];
```

<span class="small">Quelle: `src/components/sessions/configPanelShared.tsx:31-41`</span>

---

## 10 · 🎯 Bug-Lokalisierung — der zentrale Befund

**Vergleich der Tab-Gruppen:**

| Tab | Gruppe | `requiresPresence` |
|-----|--------|--------------------|
| CLAUDE.md, Skills, Hooks, Settings, Agents | context | **JA** (claudeMd/skills/hooks/…) |
| **GitHub, Worktrees, Kanban** | **project** | **NEIN** ⚠️ |
| History | history | **NEIN** (aber fachlich OK) |

- Alle `context`-Tabs haben ein `requiresPresence`-Feld → sie werden bereits sauber ausgeblendet, wenn das jeweilige Artefakt fehlt.
- Die `project`-Tabs haben **keinen** solchen Marker → der Filter `visibleTabs` lässt sie **immer** durch.
- Der Mechanismus für "conditional tabs" ist also schon da — er wurde nur **nicht auf die `project`-Gruppe angewendet**.

**Ursache vermutlich historisch:** Als die GitHub-Features dazukamen, wurde der Presence-Check (Git/Remote) nicht auch in `Presence`-Interface und Detection-`useEffect` nachgezogen.

---

## 11 · `ConfigPanelTabList.tsx` — Presence-Interface

```ts
interface Presence {
  claudeMd: boolean;
  skills:   boolean;
  agents:   boolean;
  hooks:    boolean;
  settings: boolean;
  // ⚠️ FEHLT: git: boolean;
  // ⚠️ FEHLT: github: boolean;
}
```

- Interface trackt **nur** `context`-Gruppen-Artefakte.
- Presence-State wird als `Presence | null` gehalten (`null` = noch am Laden → alle Tabs sichtbar, um Layout-Flash zu verhindern).
- Für den Fix: `Presence` wird um `git` und `github` erweitert, beide defaulten auf `false` bis Detection fertig ist.

<span class="small">Quelle: `src/components/sessions/ConfigPanelTabList.tsx:10-16, 92`</span>

---

## 12 · `ConfigPanelTabList.tsx` — Detection-Logik

```tsx
useEffect(() => {
  let cancelled = false;
  if (!folder) { setPresence(null); return; }
  (async () => {
    const [claudeMdText, skillDirs, agentFiles, settingsText] = await Promise.all([
      invoke<string>("read_project_file", { folder, relativePath: "CLAUDE.md" }).catch(() => ""),
      invoke<unknown[]>("list_skill_dirs", { folder }).catch(() => []),
      invoke<string[]>("list_project_dir", { folder, relativePath: ".claude/agents" })
        .then((f) => f.filter((x) => x.endsWith(".md"))).catch(() => []),
      invoke<string>("read_project_file", { folder, relativePath: ".claude/settings.json" }).catch(() => ""),
    ]);
    // … hasHooks aus settingsText geparst …
    setPresence({ claudeMd: !!claudeMdText, skills: skillDirs.length > 0, agents: …, hooks: …, settings: !!settingsText });
  })();
  return () => { cancelled = true; };
}, [folder]);
```

- **Promise.all mit `.catch(() => default)`** → sauberes Fallback-Handling, Detection bricht nicht bei einem fehlschlagenden Tauri-Call.
- **Cancellation-Flag** verhindert State-Update bei unmount.
- **Für den Fix:** Hier werden **zwei** neue `invoke`-Aufrufe ergänzt (`check_project_presence` für git + github).

<span class="small">Quelle: `src/components/sessions/ConfigPanelTabList.tsx:94-127`</span>

---

## 13 · `ConfigPanelTabList.tsx` — visibleTabs-Filter

```tsx
const visibleTabs = useMemo(() => CONFIG_TABS.filter((tab) => {
  if (!tab.requiresPresence) return true;        // ← hier rutscht github/worktrees/kanban durch
  if (presence === null) return true;            // loading — alle sichtbar (Anti-Flash)
  return presence[tab.requiresPresence as PresenceKey];
}), [presence]);
```

- **Die Zeile `if (!tab.requiresPresence) return true`** ist die Kern-Stelle, die das fehlende Feld durchwinkt.
- Nach dem Fix (alle `project`-Tabs haben `requiresPresence`) greift der zweite Zweig → unsichtbar, solange `presence.git`/`presence.github` false ist.
- Auto-Switch-Effekt unterhalb wählt bereits automatisch einen anderen Tab, wenn der aktive ausgeblendet wird (Zeile 136-143) — **kein zusätzlicher Fix nötig**.

<span class="small">Quelle: `src/components/sessions/ConfigPanelTabList.tsx:129-133`</span>

---

## 14 · `GitHubViewer.tsx` — internes Conditional Rendering

```tsx
// Zeile 172-180: Early-Return bei Git-Fehler
if (gitError) {
  return (
    <div className="flex flex-col items-center …">
      <Github className="w-10 h-10 text-neutral-600" />
      <span className="text-sm">Kein Git-Repository</span>
      <span className="text-xs">{folder}</span>
    </div>
  );
}
// Zeile 197: Branch/Commit nur mit Info
{gitInfo && (<div>…</div>)}
// Zeile 238, 278: PRs und Issues nur ohne gh-Fehler
{!ghError && (<div>…</div>)}
```

- Die Komponente **weiß bereits**, wie sie mit "kein Git" umgeht — zeigt eine informative Leerseite.
- **Aber:** Diese Seite kommt erst **nach** Klick auf den Tab. Das ist genau der UX-Pain des Users.
- Nach dem Fix wird diese Leerseite nur noch als Fallback gezeigt (z.B. wenn User direkt `uiStore.configSubTab = "github"` setzt, bevor Detection fertig ist).

<span class="small">Quelle: `src/components/sessions/GitHubViewer.tsx:172-180, 197, 238, 278`</span>

---

## 15 · `GitHubViewer.tsx` — Error-Paths

- **Kein Git-Repo** → `gitError` gesetzt → Full-Screen-Leerseite (siehe Slide 14).
- **Git, aber kein `gh` installiert** → `ghError` = "gh CLI nicht gefunden" → Hinweis-Box.
- **Git + gh, aber kein GitHub-Remote** → `get_github_prs` gibt leere Liste zurück → "0 Pull Requests".
- **In-Memory-Cache** (60 s TTL) auf `folder`-Key → kein Doppel-Fetch beim Tab-Zurück.

**Relevanz für den Fix:** Der GitHubViewer bleibt **unverändert**. Alle Fehlerpfade bleiben als Defensive drin — sie werden nur selten ausgelöst, weil der Tab dann gar nicht mehr sichtbar ist.

---

## 16 · Datenmodell — Projekt-Typen

```ts
// src/store/projectStore.ts
interface FolderProject { projectNumber: number; projectId: string; title: string; }

// src/store/settingsStore.ts
interface FavoriteFolder {
  id: string; path: string; label: string;
  shell: "powershell" | "cmd" | "gitbash";
  addedAt: number; lastUsedAt: number;
}

// src/store/projectConfigStore.ts
interface ProjectConfig {
  path: string; label: string;
  hasClaude: boolean; skillCount: number; hookCount: number;
  skills: string[]; hooks: string[]; error?: string;
}
```

- **Drei verschiedene "Projekt"-Sichten** — kein einheitliches `Project`-Aggregat.
- **Kein einziger Typ** hat ein Feld `hasGit`, `hasGithub`, `gitRemote`.
- `ProjectConfig` kommt dem Ideal am nächsten (es hat `hasClaude`) — Erweiterung um `hasGit`/`hasGithub` wäre konsistent. **Nicht nötig** für den Fix, Presence-State in TabList reicht.

---

## 17 · Stores & Persistenz

| Store | Scope | Persistenz |
|-------|-------|------------|
| `sessionStore` | aktive PTY-Sessions | ephemer (RAM) |
| `uiStore` | Tabs, Toasts, `configSubTab`, Dirty-Flags | ephemer |
| `settingsStore` | Favoriten, Pinned Docs, Notes, Theme | **`Documents/AgenticExplorer/settings.json`** via Tauri-Custom-Middleware (300 ms debounce) |
| `projectStore` | Folder → GitHub-Project-Mapping | `localStorage` (`agentic-project-store`) |
| `projectConfigStore` | CLAUDE.md / Skills / Hooks Scans | ephemer (wird bei Bedarf neu gescannt) |
| `agentStore` | Agent-Detection | ephemer |

**Für den Fix:** Presence-Status bleibt **ephemer** in `ConfigPanelTabList` (wie bisher die `context`-Presence). Keine Persistenz nötig — Detection ist billig (< 50 ms).

---

## 18 · Rust-Backend — GitHub-/Git-Commands

| Command | Args | Return |
|---------|------|--------|
| `get_git_info` | `folder` | `GitInfo { branch, last_commit, remote_url }` |
| `get_github_prs` | `folder` | `Vec<GithubPR>` (Limit 20) |
| `get_github_issues` | `folder` | `Vec<GithubIssue>` (Limit 20) |
| `get_issue_detail` | `folder?, repo?, number` | `IssueDetail` |
| `get_issue_checks` | `folder?, repo?, number` | `Vec<LinkedPR>` |
| `post_issue_comment` | `folder?, repo?, number, body` | `()` |
| `list_user_projects` | `folder?` | `Vec<ProjectSummary>` |
| `get_project_board` | `project_number, project_id, folder?` | `ProjectBoard` |
| `move_project_item` | `…` | `()` |

<span class="small">Alle Commands nutzen `gh` oder `git` CLI, Default-Timeout 30 s (`DEFAULT_COMMAND_TIMEOUT`).</span>

---

## 19 · `get_git_info` — die einzige Git-Detection heute

```rust
#[tauri::command]
pub async fn get_git_info(folder: String) -> Result<GitInfo, ADPError> {
    let folder_path = std::path::Path::new(&folder);
    if !folder_path.join(".git").exists() {
        return Err(ADPError::validation("Not a git repository"));
    }
    let branch = run_command(&folder, "git", &["rev-parse", "--abbrev-ref", "HEAD"]).unwrap_or_default();
    let last_commit = run_command(&folder, "git", &["log", "-1", "--format=%H%n%s%n%ci"]).ok();
    let remote_url = run_command(&folder, "git", &["remote", "get-url", "origin"]).unwrap_or_default();
    Ok(GitInfo { branch, last_commit, remote_url })
}
```

- **Prüft nur** `.git`-Ordner-Existenz — nicht, ob Remote existiert und ob er auf github.com zeigt.
- Wird in UI aktuell **zweckentfremdet** als Presence-Proxy (in `KanbanDashboardView`), liefert aber zu wenig Info für saubere Tab-Ausblendung.
- Für den Fix: neuer dedicated Command `check_project_presence` (siehe Slide 26).

<span class="small">Quelle: `src-tauri/src/github/commands.rs:183-216`</span>

---

## 20 · Was im Backend fehlt

**Nicht vorhanden:**

- `check_project_presence(folder)` — kombinierter Status `{ has_git, has_github, remote_url }`
- `project_has_github(folder)` — boolean, kompakt
- Caching auf Rust-Seite (jedes Frontend-Rerender → frischer CLI-Call)

**Konsequenz ohne Fix:**

- Frontend muss für Presence aktuell **`get_git_info`** aufrufen → wirft bei Nicht-Git eine Exception → Exception wird **als Fehler geloggt**, obwohl es ein erwartetes Ergebnis ist. Log-Rauschen.
- Keine Kombi-Info (hat zwar `.git`, aber kein Remote) → Worktrees-Tab und GitHub-Tab lassen sich nicht differenziert behandeln.

**Mit dem Fix-Command:** Saubere semantische Trennung + kein Exception-Log.

---

## 21 · Root-Cause — Zusammenfassung

**Drei Dinge fehlen, alle im selben semantischen Bereich:**

1. **Tab-Deklaration:** `CONFIG_TABS`-Einträge für `github`, `worktrees`, `kanban` ohne `requiresPresence`. (`configPanelShared.tsx:37-39`)
2. **Presence-Interface:** `Presence` in `ConfigPanelTabList` kennt kein `git`/`github`. (`ConfigPanelTabList.tsx:10-16`)
3. **Presence-Detection:** `useEffect`-Block lädt nur `context`-Artefakte, nicht Git/GitHub-Status. (`ConfigPanelTabList.tsx:94-127`)

**Nicht** der Root-Cause:

- GitHubViewer hat korrektes Error-Handling, ist nur zu spät (nach Klick).
- Backend-Commands funktionieren; sie wurden nur nie für eine billige Presence-Abfrage vorgesehen.
- Daten-Modelle haben keinen `hasGithub`-Stempel, aber das ist für diesen Fix **kein Muss** — Presence reicht lokal in der Komponente.

---

## 22 · Fix-Strategie — Übersicht

**Ziel:** Dem bestehenden `requiresPresence`-Pattern treu bleiben. Keine neuen Architektur-Konzepte.

**Vier Touchpoints:**

1. **`configPanelShared.tsx`** — `PresenceKey` um `"git" | "github"` erweitern, `CONFIG_TABS`-Einträge markieren.
2. **`ConfigPanelTabList.tsx`** — `Presence`-Interface ergänzen, neuen `invoke`-Call in Detection-`Promise.all`.
3. **`src-tauri/src/github/commands.rs`** — neuer Tauri-Command `check_project_presence`.
4. **Tests** — Presence-Detection in Vitest, Rust-Command in `cargo test`.

**Nicht nötig:**

- Datenmodell-Änderungen, Store-Änderungen, GitHubViewer-Änderungen.
- Migration / DB-Changes / Config-Changes.

**Aufwand:** 80–120 Code-Zeilen + 3-5 Tests. Geschätzte Umsetzung: 45-60 Min durch Implementation-Agenten.

---

## 23 · Fix-Code #1 — `configPanelShared.tsx`

```ts
export type PresenceKey =
  | "claudeMd" | "skills" | "agents" | "hooks" | "settings"
  | "git" | "github";   // ← NEU

export const CONFIG_TABS: ConfigTab[] = [
  // … context-group unverändert …
  { id: "github",    label: "GitHub",    icon: Github,   group: "project",
    requiresPresence: "github" },                             // ← NEU
  { id: "worktrees", label: "Worktrees", icon: GitBranch, group: "project",
    requiresPresence: "git" },                                // ← NEU
  { id: "kanban",    label: "Kanban",    icon: Columns3, group: "project",
    requiresPresence: "github" },                             // ← NEU
  { id: "history",   label: "History",   icon: Clock,    group: "history" },
];
```

- `Worktrees` braucht nur **Git** (kann lokal funktionieren), daher `requiresPresence: "git"`.
- `GitHub` und `Kanban` brauchen zusätzlich **Remote zu github.com**, daher `"github"`.

---

## 24 · Fix-Code #2 — `ConfigPanelTabList.tsx`

```ts
interface Presence {
  claudeMd: boolean; skills: boolean; agents: boolean;
  hooks: boolean;    settings: boolean;
  git:    boolean;   github:   boolean;   // ← NEU
}

// im useEffect:
const [claudeMdText, skillDirs, agentFiles, settingsText, projectPresence] =
  await Promise.all([
    invoke<string>("read_project_file", …).catch(() => ""),
    // … unverändert …
    invoke<{ has_git: boolean; has_github: boolean }>(
      "check_project_presence", { folder }
    ).catch(() => ({ has_git: false, has_github: false })),   // ← NEU
  ]);

setPresence({
  claudeMd: …, skills: …, agents: …, hooks: …, settings: …,
  git:    projectPresence.has_git,                            // ← NEU
  github: projectPresence.has_github,                         // ← NEU
});
```

- **Kein Breaking Change:** `Promise.all` wird um einen 5. Eintrag erweitert; `.catch(fallback)` garantiert Robustheit.
- Fallback setzt beide Flags auf `false` → Tabs bleiben im Fehlerfall ausgeblendet.

---

## 25 · Fix-Code #3 — `src-tauri/src/github/commands.rs`

```rust
#[derive(Serialize)]
pub struct ProjectPresence {
    pub has_git: bool,
    pub has_github: bool,
    pub remote_url: Option<String>,
}

#[tauri::command]
pub async fn check_project_presence(folder: String)
    -> Result<ProjectPresence, ADPError>
{
    let path = std::path::Path::new(&folder);
    let has_git = path.join(".git").exists();
    let remote_url = if has_git {
        run_command(&folder, "git", &["remote", "get-url", "origin"]).ok()
    } else { None };
    let has_github = remote_url.as_deref()
        .map(|u| u.contains("github.com"))
        .unwrap_or(false);
    Ok(ProjectPresence { has_git, has_github, remote_url })
}
```

- **Kein `gh`-Call nötig** — rein Git-CLI + Pfad-Check, daher schnell (< 30 ms).
- Im `invoke_handler` registrieren (`lib.rs`).

---

## 26 · Alternativen, die wir verworfen haben

| Alternative | Pro | Kontra | Entscheid |
|-------------|-----|--------|-----------|
| `hasGit` in `ProjectConfig` speichern | Persistent, reusable | Stale-Risiko bei externem Git-Init, Migrations-Aufwand | ❌ |
| Presence-State in Zustand-Store (global) | Zentralisiert | Neue Store-Logik, ephemer reicht | ❌ |
| Polling alle 30 s (wie `useGitBranch`) | Auto-Update | Overkill, Detection reagiert schon auf `folder`-Change | ❌ |
| **`requiresPresence`-Pattern fortsetzen** | Minimal-invasiv, konsistent, testbar | — | ✅ Empfohlen |
| Nur GitHub-Tab hiden (Worktrees/Kanban drin lassen) | Weniger Code | User-Anforderung spricht von "Optionen" (Plural) | ❌ |

---

## 27 · Impact-Analyse

**Betroffene UI-Stellen (werden mit-aktualisiert, sobald Presence erweitert ist):**

- `ConfigPanel` in Split-View (Session-Ansicht rechts)
- `FavoritePreview` → nutzt denselben `ConfigPanelTabList` (Slide 16) → automatisch gefixt
- `KanbanDashboardView` → nutzt eigenen `get_git_info`-Scan (könnte Folgefix werden, ist aber unabhängig)

**Nicht betroffen / bewusst ausgeschlossen:**

- `GitHubViewer` interne Logik (bleibt als Fallback)
- Rust-Backend-Commands `get_git_info`, `get_github_prs`, etc. (bleiben)
- Datenmodelle und Persistenz

**Regressions-Risiken:**

- Wenn User genau auf "GitHub"-Tab steht und zu einem Nicht-Git-Ordner switcht → Auto-Switch-Effekt (`ConfigPanelTabList.tsx:136-143`) fängt das bereits ab. **Kein zusätzlicher Code nötig.**
- Fallback bei Detection-Fehler: `has_git/has_github = false` → Tabs ausgeblendet. Das ist die sichere Seite.

---

## 28 · Test-Strategie

**Vitest (Frontend):**

- `ConfigPanelTabList.test.tsx`: Mock `invoke("check_project_presence")` → prüfe, ob GitHub-Tab bei `has_github=false` ausgeblendet wird.
- Edge-Case: `presence === null` (loading) → alle Tabs sichtbar (Anti-Flash, bestehendes Verhalten).
- Edge-Case: Detection wirft → Tabs ausgeblendet (fail-safe).

**cargo test (Rust):**

- `check_project_presence`: temp-Ordner ohne `.git` → `{ has_git: false, has_github: false }`.
- `check_project_presence`: temp-Git-Ordner mit `git init` ohne Remote → `{ true, false }`.
- `check_project_presence`: mit Remote zu `github.com/x/y` → `{ true, true, Some("…github.com…") }`.

**Manual QA:**

- Test-Matrix aus Slide 5 durchspielen in `npm run tauri dev`.
- Screenshot vorher/nachher für Release-Notes.

---

## 29 · Phase 2 — Nächste Schritte nach User-Review

| Schritt | Owner | Dauer |
|---------|-------|-------|
| 1. User-Review dieses Decks | **User** | 10–15 min |
| 2. Freigabe für Phase 2 | User | — |
| 3. Fix-Agent-Team spawnen (3-4 Agenten parallel) | Main-Session | 5 min Setup |
| 4. Code-Änderungen umsetzen (Slides 23–25) | Agent 1 (Frontend) + Agent 2 (Rust) | 30 min |
| 5. Tests schreiben (Slide 28) | Agent 3 (Test) | 20 min |
| 6. `cargo check` + `npx tsc --noEmit` + `npm run test` | Quality-Gate-Agent | 5 min |
| 7. Build: `npm run tauri build` | Build-Agent | 5 min |
| 8. Handover an User für Phase 3 (manuelle Verifikation) | Main-Session | — |

**Branch-Strategie:** Feature-Branch `fix/config-tabs-presence-project-group`, PR gegen master nach grünem Build.

---

## 30 · Zusammenfassung

**Was haben wir in Phase 1 gelernt?**

- Der Bug ist **präzise lokalisiert** (2 Dateien, 3 Zeilen-Blöcke).
- Das nötige Pattern **existiert bereits** (`requiresPresence`) — wir erweitern, wir erfinden nicht.
- Kein Datenmodell-, Store- oder Architektur-Change.
- Risiko **niedrig**, Aufwand **klein**, Impact **sichtbar und sofort erfahrbar**.

**Entscheidungsfrage an den User:**

1. Ist die **Problembeschreibung** (Slides 4-6) korrekt?
2. Ist die **Fix-Strategie** (Slides 22-26) die gewünschte Richtung?
3. Gibt es weitere "Optionen", die ausgeblendet werden sollen (z.B. im Pipeline-Bereich)? — Falls ja: Phase 2 erweitern.
4. **Freigabe für Phase 2?**

> **Danke für Phase 1. Bitte reviewen — ich warte auf Freigabe.**
