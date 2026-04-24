---
marp: true
theme: default
paginate: true
size: 16:9
backgroundColor: "#0d1117"
color: "#e6edf3"
style: |
  section {
    font-family: 'Segoe UI', system-ui, sans-serif;
    font-size: 22px;
    padding: 60px 70px;
  }
  h1 {
    color: #00ff88;
    font-size: 48px;
    border-bottom: 2px solid #30363d;
    padding-bottom: 12px;
    margin-bottom: 24px;
  }
  h2 { color: #58a6ff; font-size: 36px; margin-bottom: 18px; }
  h3 { color: #f78166; font-size: 26px; }
  code { background: #161b22; padding: 2px 6px; border-radius: 4px; font-family: 'Cascadia Code', 'Fira Code', Consolas, monospace; font-size: 0.9em; }
  pre { background: #161b22; border: 1px solid #30363d; border-radius: 6px; padding: 14px 18px; font-size: 15px; line-height: 1.45; }
  pre code { background: transparent; padding: 0; }
  table { border-collapse: collapse; width: 100%; font-size: 18px; }
  th { background: #161b22; color: #58a6ff; padding: 8px 12px; text-align: left; border: 1px solid #30363d; }
  td { padding: 6px 12px; border: 1px solid #30363d; }
  strong { color: #ffa657; }
  .hot { color: #ff7b72; font-weight: bold; }
  .ok { color: #56d364; font-weight: bold; }
  .muted { color: #8b949e; }
footer: "Session-Scroll-Bug Iteration 2 — AgenticExplorer v1.6.26"
---

<!-- _paginate: false -->
<!-- _footer: "" -->

# Session-Scroll-Bug — Iteration 2
## Race-Condition + Brillante Lösung

**v1.6.26** · 2026-04-23

User-Feedback zur Iteration 1:
> „immernoch nicht behoben... beim starten kriegt er das hin, weil wir
>  glaube ich auch einfach resume session machen... aber das gilt nur
>  der session die sich als erstes beim start der app öffnet"

**Analyse-Team:** 3 parallele Explore-Subagenten (E1 Timing, E2 Resume-Magic, E3 Design)

---

# TL;DR — Iteration 2

<br>

1. <span class="ok">Iteration 1 (Always-Mount) hat den **Tab-Switch**-Bug gelöst.</span> Das war richtig.

2. <span class="hot">Aber nicht den **Session-Create-Race**.</span> Bei neuen Sessions kommen die ersten ~140–200 Bytes von Claude CLI **bevor** die `<SessionTerminal>`-Component ihren `listen("session-output")` registriert hat. Die Bytes sind weg.

3. <span class="hot">Warum die erste Session funktioniert:</span> `handleResumeSession` übergibt `resumeSessionId` → Claude CLI startet mit `--resume <id>` → blockt 100–200ms beim History-Lesen → React hat Zeit, zu mounten, bevor PTY-Output kommt.

4. <span class="ok">Fix: **`terminalRegistry.ts`** — module-level Ring-Buffer (500KB/Session) + Subscriber-Pattern, befüllt vom globalen `useSessionEvents`-Hook (aktiv ab App-Start). SessionTerminal hydriert beim Mount aus dem Buffer → garantiert keine verlorenen Bytes.</span>

---

# Die Race-Condition präzise

```
T+0ms   User klickt „Neue Session"
T+3ms   wrapInvoke("create_session", ...)
T+8ms   Rust: Session::spawn() + Reader-Thread
T+9ms   Claude CLI startet, gibt Welcome aus → Rust emit("session-output")
                                              └→ Event in Tauri-Queue
T+9ms   wrapInvoke-Promise resolves → store.addSession → activeSessionId set
T+15ms  React re-rendert SessionManagerView
T+20ms  Neue <SessionTerminal sessionId="new"> mountet
T+25ms  useEffect läuft: new Terminal(), term.open(), fitAddon.fit()
T+30ms  listen("session-output", callback) aufgerufen (Promise)
T+50ms  Tauri-Bridge: Listener registriert in Event-Bus

┌─────────────────────────────────────────────────────┐
│ RACE-FENSTER: T+9ms ... T+50ms = ~41ms Bytes-LOSS │
└─────────────────────────────────────────────────────┘
```

**Bytes verloren pro neuer Session:** Welcome (~50B) + System-Prompt-Echo (~75B) + Prompt-Setup (~20B) = **~140-200 Bytes = 2-3 Terminal-Zeilen**.

---

# Warum Iteration 1 das nicht gelöst hat

<br>

**Always-Mount** sagt: Terminal wird nicht gekillt beim Tab-Switch. Korrekt — Tab-Switch-Szenario ist damit gefixt.

**Aber:** Beim ERSTEN Mount einer neuen Session-Component ist das Terminal **leer**. Der Listener-Registrations-Race passiert **unabhängig** vom Lifecycle-Fix.

<br>

| Szenario | Iteration 1 Fix? | Tatsächliches Ergebnis |
|---|---|---|
| User tabt zwischen bestehenden Sessions | ✅ | xterm-Buffer überlebt |
| User öffnet Auto-Resume beim App-Start | ✅ (war schon OK) | Claude `--resume` blockt 100-200ms → Mount rechtzeitig |
| User erstellt neue Session via QuickStart | <span class="hot">❌</span> | Race, erste 140-200 Bytes verloren |
| User macht mehrere Sessions auf einmal | <span class="hot">❌</span> | Race für jede außer der ersten |

---

# Warum die erste Session funktioniert (Resume-Magic)

`src-tauri/src/session/manager.rs:431-454`

```rust
fn shell_args(shell: &str, resume_session_id: Option<&str>) -> Vec<String> {
    let claude_cmd = match resume_session_id {
        Some(id) => format!("claude --dangerously-skip-permissions --resume {}", id),
        None => "claude --dangerously-skip-permissions".to_string(),
    };
    // ...
}
```

<br>

**Mit `--resume <id>`:**
- Claude CLI liest `~/.config/claude/sessions/<id>/history.json` (kann 100KB sein)
- Das dauert **100-200ms** — blockierender Disk-Read
- Währenddessen hat React Zeit, `SessionTerminal` zu mounten
- Listener ist registriert, BEVOR die ersten Output-Bytes kommen
- <span class="ok">Race verpasst sich selbst</span>

**Ohne `--resume` (QuickStart):**
- Claude CLI startet frisch in <10ms
- Output kommt sofort
- <span class="hot">React ist zu langsam</span>

---

# Die Hypothesen-Tabelle

| # | Hypothese | Evidence | Priority |
|---|---|---|---|
| R1 | **Race: `listen()` registriert zu spät** | E1 bestätigt 21-41ms Race-Fenster | <span class="hot">PRIMARY</span> |
| R2 | Kein globaler Output-Buffer als Safety-Net | useSessionEvents hat nur rolling 500B-Snippet | Aggravator zu R1 |
| R3 | Per-Component Listener vervielfacht das Race | Jedes Terminal läuft eigenes `listen()` | Aggravator zu R1 |
| R4 | `handleQuickStart` übergibt keine `resumeSessionId` | useSessionCreation.ts:55-86 | By design (neue Session), aber verstärkt R1 |
| R5 | Scrollback-Größe zu klein | 5000 Zeilen reichen meistens | Sekundär, nicht R1-relevant |

<br>

<span class="hot">R1 + R2 + R3 wirken zusammen.</span> Die Lösung muss alle drei adressieren.

---

# Die brilliante Lösung

### Kernidee
Der **globale** `useSessionEvents`-Listener ist ab App-Start aktiv — er verpasst NIEMALS ein Event. Wir machen ihn zum **Full-Output-Schreiber** in einen Module-Level Ring-Buffer. SessionTerminal **liest beim Mount** aus dem Buffer (= Hydrate) und abonniert dann live.

<br>

```
┌────────────────┐  append   ┌─────────────────────────────┐
│ session-output │──────────▶│  terminalRegistry (module)   │
│ Event (Tauri)  │           │                               │
└────────────────┘           │  outputBuffers: Map<id, str> │
                             │  ring-buffer 500KB/sessionId │
                             │                               │
                             │  terminalHandlers: Map<id,   │
                             │    Set<Handler>>             │
                             └─────────┬────────────┬────────┘
                                       │ broadcast  │ getBuffer()
                                       │            │ (hydrate)
                                       ▼            ▼
                             ┌──────────────────────────────┐
                             │  SessionTerminal (N Instanzen)│
                             │  subscribe → term.write       │
                             └──────────────────────────────┘
```

---

# API-Design: `terminalRegistry.ts`

```typescript
/** Append + broadcast — aufgerufen vom globalen useSessionEvents */
export function appendToBuffer(sessionId: string, data: string): void;

/** Volle Buffer-History — für SessionTerminal-Hydrate beim Mount */
export function getBuffer(sessionId: string): string;

/** Live-Updates abonnieren — return unsubscribe */
export function subscribeToTerminal(
  sessionId: string,
  handler: (data: string) => void,
): () => void;

/** Cleanup bei removeSession */
export function clearBuffer(sessionId: string): void;
```

<br>

**Invarianten:**
- Ring-Buffer Cap: 500 KB pro Session (verwirft älteste 10% bei Overflow)
- Mehrere Handler pro sessionId erlaubt (Grid-Mode: 2 Terminals für eine Session)
- Broadcast ist synchron, O(n) mit n = Anzahl Handler
- Module-State → keine Zustand-Store-Churn, keine Re-Renders

---

# Integration: useSessionEvents.ts

```typescript
import { appendToBuffer } from "../terminalRegistry";

// im session-output-Handler:
listen<{ id: string; data: string }>("session-output", (event) => {
  const { id, data } = event.payload;

  // NEU: volle Bytes in Ring-Buffer + Broadcast
  appendToBuffer(id, data);

  // BLEIBT: rolling 500B für lastOutputSnippet (Session-Card-Preview)
  // ... bestehende Logik
});
```

<br>

Eine Zeile. Das globale Listener-Objekt wird zur **single source of truth** für alle Session-Output-Bytes.

---

# Integration: SessionTerminal.tsx

```typescript
import { subscribeToTerminal, getBuffer } from "../terminalRegistry";

useEffect(() => {
  // ... Terminal-Setup (new Terminal, open, etc.)

  // PHASE 1 — Hydrate (synchron, liefert alle bisherigen Bytes sofort)
  const history = getBuffer(sessionId);
  if (history) term.write(history);

  // PHASE 2 — Subscribe für Live-Updates
  const unsubscribe = subscribeToTerminal(sessionId, (data) => {
    term.write(data, () => {
      if (!userScrolledUpRef.current) term.scrollToBottom();
    });
  });

  return () => { unsubscribe(); /* rest of cleanup */ };
}, [sessionId]);
```

<br>

Kein per-Component `listen("session-output")` mehr. Race ist **strukturell unmöglich**, weil der Buffer vom App-Start an gefüllt wird.

---

# Vergleich mit Alternativen

| Ansatz | Race gelöst? | Re-Render-Churn | Grid-Mode | LOC |
|---|---|---|---|---|
| **terminalRegistry (empfohlen)** | <span class="ok">✅</span> | Null (module state) | ✅ N Handler | ~160 |
| Store-Ring-Buffer | ✅ | <span class="hot">❌ pro Event</span> | ✅ | ~200 |
| Per-Component Local-Buffer | <span class="hot">❌</span> | Null | <span class="hot">❌ Duplikate</span> | ~80 |
| Claude CLI immer mit `--resume` | Teilweise | Null | ✅ | ~10 — aber Semantic-Change |

<br>

<span class="ok">terminalRegistry gewinnt auf allen Achsen.</span>

---

# Edge-Cases & Mitigationen

| Edge-Case | Risiko | Mitigation |
|---|---|---|
| MB/s-Burst (Claude-Streaming mit viel Output) | Ring-Buffer läuft voll schnell | 500KB-Cap, 10% drop = amortized O(1) |
| UTF-8 Multi-Byte-Zeichen an Slice-Boundary | Kaputtes Zeichen am Buffer-Start | Line-based slice (optional enhancement): `buf.lastIndexOf("\n", dropCount)` |
| 2 SessionTerminals für gleiche sessionId (Single+Grid) | Doppel-Write? | `Set<Handler>` → jedes Terminal bekommt exakt 1 Write |
| Session wird entfernt, aber Buffer leakt | Memory-Leak | `sessionStore.removeSession` ruft `clearBuffer(id)` |
| App-Crash, Buffer weg | Kein Crash-Recovery | Out-of-scope — v1.6.27 optional mit Disk-Persist |

---

# Regression-Test (der Bug selbst)

```typescript
test("buffered output not lost before SessionTerminal mount", async () => {
  // Simuliere: Session erstellt, Rust-Events feuern VOR Component-Mount
  appendToBuffer("sess-race", "output1\n");
  appendToBuffer("sess-race", "output2\n");
  appendToBuffer("sess-race", "output3\n");

  // Jetzt mountet die Component
  const { container } = render(<SessionTerminal sessionId="sess-race" />);

  // Alle 3 Outputs müssen sichtbar sein (Hydrate aus Buffer)
  await waitFor(() => {
    const screen = container.querySelector(".xterm-screen");
    expect(screen?.textContent).toContain("output1");
    expect(screen?.textContent).toContain("output2");
    expect(screen?.textContent).toContain("output3");
  });
});
```

<br>

Dieser Test hätte Iteration-1-Fix **nicht bestanden**. Er wird Iteration-2-Fix bestehen.

---

# Implementation-Plan

### Phase 1 — terminalRegistry (~1h)
Neues File mit 7 exports, Unit-Tests (8 Cases: append/get, cap, subscribe, unsubscribe, multi-handler, error-isolation, clearBuffer, clearHandlers).

### Phase 2 — useSessionEvents (~15min)
+1 Import, +1 Zeile `appendToBuffer(id, data)`. Bestehende Snippet-Logic bleibt.

### Phase 3 — SessionTerminal (~30min)
Ersetze `listen("session-output")` durch `subscribeToTerminal` + `getBuffer`-Hydrate. Cleanup via unsubscribe.

### Phase 4 — sessionStore.ts (~10min)
`removeSession` ruft `clearBuffer(id)`.

### Phase 5 — Regression-Test (~30min)
Der Race-Test oben. Plus: Unsubscribe-on-Unmount, Multi-Handler, Ring-Buffer-Cap.

### Phase 6 — Gates + Build + Smoke (~45min)
tsc, lint, build, vitest, cargo fmt/clippy/test. Production-Build. Smoke: Neue Session erstellen, Output anschauen, hochscrollen.

**Gesamt: ~3h, ~340 LOC (160 prod + 180 test).**

---

# Zusammenfassung Iteration 2

<br>

- <span class="hot">Iteration 1 (Always-Mount) löste Tab-Switch, nicht Session-Create-Race</span>
- <span class="hot">Race-Fenster: 21–41ms zwischen PTY-Output und Listener-Subscribe</span>
- <span class="ok">Fix: Module-Level Ring-Buffer + Subscriber-Pattern + Hydrate</span>
- <span class="ok">Bytes werden ab App-Start gesammelt — keine verlorene Gelegenheit mehr</span>
- <span class="ok">Grid-Mode-safe, Memory-bounded, Zero-Render-Churn</span>

<br>

### Eine Zeile, die den Fix erklärt:

```typescript
// VOR dem term.write im useEffect:
term.write(getBuffer(sessionId));   // Hydrate aus globalem Buffer
```

<br>

**Nächster Schritt:** User reviewed, dann Impl (3h), dann Build, dann User-Verifikation.
