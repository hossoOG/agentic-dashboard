# Sprint-Plan: v1.5 (Stabilisierung) → v2.0 (Pipeline Fundament)

> **Stand:** 2026-04-04 | **Basis:** v1.4.0 | **PO-Vorgabe:** Plan-First, GitHub Issues
> **Kapazitaet:** 1 Entwickler, ~6h/Tag effektiv

---

## 1. Sprint-Uebersicht (Gantt)

```mermaid
gantt
    title AgenticExplorer v1.5 → v2.0 Roadmap
    dateFormat  YYYY-MM-DD
    axisFormat  %d.%m

    section Sprint 1 — Stabilisierung + Security
    SEC-01 DOMPurify XSS Fix           :s1_1, 2026-04-07, 1d
    SEC-02 Path Traversal Haertung      :s1_2, 2026-04-07, 1d
    SEC-03 Shell Command Centralization :s1_3, 2026-04-08, 1d
    SEC-04 Input Validation Module      :s1_4, 2026-04-09, 1d
    DEBT-01 Issue-Hygiene + Labels      :s1_5, 2026-04-07, 1d
    DEBT-02 DashboardMap Legacy entf.   :s1_6, 2026-04-09, 1d
    DEBT-03 ConnectionLines Dead Code   :s1_7, 2026-04-09, 1d
    DEBT-04 Store Deduplizierung        :s1_8, 2026-04-10, 1d
    DEBT-05 Zustand Selektoren Editor   :s1_9, 2026-04-10, 1d
    Sprint 1 Review                     :milestone, s1_rev, 2026-04-11, 0d

    section Sprint 2 — QA-Infrastruktur
    QA-01 projectConfigStore Tests      :s2_1, 2026-04-14, 2d
    QA-02 Persistenz-Layer Tests        :s2_2, 2026-04-14, 2d
    QA-03 Component-Tests Coverage 70%  :s2_3, 2026-04-16, 3d
    QA-04 Editor-Komponenten Tests      :s2_4, 2026-04-16, 1d
    DEVOPS-01 CI Coverage Enforcement   :s2_5, 2026-04-21, 1d
    DEVOPS-02 Dependency Audit CI       :s2_6, 2026-04-21, 1d
    DEVOPS-03 Branch Protection Rules   :s2_7, 2026-04-22, 1d
    SEC-05 Rate Limiting GitHub API     :s2_8, 2026-04-22, 1d
    SEC-06 IPC Command Rate Limiting    :s2_9, 2026-04-23, 1d
    SEC-07 Secrets Detection Settings   :s2_10, 2026-04-23, 1d
    Sprint 2 Review                     :milestone, s2_rev, 2026-04-24, 0d

    section Sprint 3 — v2.0 Foundation
    FEAT-01 Cross-Session Agent Track.  :s3_1, 2026-04-28, 4d
    FEAT-02 Audit-Log Infrastruktur     :s3_2, 2026-05-02, 3d
    FEAT-03 Real-Mode Pipeline Basics   :s3_3, 2026-05-05, 3d
    QA-05 E2E Setup WebdriverIO         :s3_4, 2026-04-28, 3d
    QA-06 8 Smoke-Tests                 :s3_5, 2026-05-01, 2d
    Sprint 3 Review                     :milestone, s3_rev, 2026-05-09, 0d

    section Sprint 4 — v2.0 Features
    FEAT-04 Activity Timeline           :s4_1, 2026-05-12, 2d
    FEAT-05 Kanban + pipelineStore      :s4_2, 2026-05-12, 1d
    FEAT-06 LogViewer Virtualisierung   :s4_3, 2026-05-14, 3d
    FEAT-07 Loading/Error/Empty States  :s4_4, 2026-05-14, 3d
    SEC-08 Library Item ID Validation   :s4_5, 2026-05-19, 1d
    FEAT-08 SessionManagerView Refactor :s4_6, 2026-05-19, 3d
    QA-07 Regressionstests v2.0         :s4_7, 2026-05-22, 1d
    v2.0 Release                        :milestone, v2_rel, 2026-05-23, 0d
```

---

## 2. Swimlane-Diagramm

```mermaid
block-beta
    columns 4

    block:header:4
        A["Sprint 1\n07.04 – 11.04"]
        B["Sprint 2\n14.04 – 24.04"]
        C["Sprint 3\n28.04 – 09.05"]
        D["Sprint 4\n12.05 – 23.05"]
    end

    block:sec["Security & Debt"]:4
        SEC1["SEC-01 XSS Fix\nSEC-02 Path Traversal\nSEC-03 Shell Central.\nSEC-04 Input Valid.\nDEBT-01..05 Cleanup"]
        SEC2["SEC-05 Rate Limit GH\nSEC-06 IPC Rate Limit\nSEC-07 Secrets Detect."]
        SEC3["—"]
        SEC4["SEC-08 Library ID Val."]
    end

    block:qa["Testing & QA"]:4
        QA1["—"]
        QA2["QA-01 ConfigStore\nQA-02 Persistenz\nQA-03 Coverage 70%\nQA-04 Editor Tests"]
        QA3["QA-05 E2E Setup\nQA-06 Smoke-Tests"]
        QA4["QA-07 Regression v2.0"]
    end

    block:feat["Features & UI"]:4
        FEAT1["—"]
        FEAT2["—"]
        FEAT3["FEAT-01 Agent Track.\nFEAT-02 Audit-Log\nFEAT-03 Real-Mode"]
        FEAT4["FEAT-04 Timeline\nFEAT-05 Kanban\nFEAT-06 LogViewer\nFEAT-07 States\nFEAT-08 Refactor"]
    end

    block:devops["DevOps & CI"]:4
        DEV1["DEBT-01 Issue-Hygiene\nLabels arc42"]
        DEV2["DEVOPS-01 CI Coverage\nDEVOPS-02 Dep. Audit\nDEVOPS-03 Branch Prot."]
        DEV3["—"]
        DEV4["Release v2.0"]
    end
```

---

## 3. Sprint-Details

### Sprint 1: Stabilisierung + Security (07.04 – 11.04, 1 Woche)

**Ziel:** Alle bekannten Sicherheitsluecken schliessen, technische Schulden abbauen, Issue-Hygiene herstellen. Ergebnis: saubere Basis fuer QA-Sprint.

| ID | Task | Size | Bezug |
|---|---|---|---|
| SEC-01 | DOMPurify XSS-Fix in MarkdownPreview.tsx | S (2h) | #68 follow-up |
| SEC-02 | Path Traversal Haertung file_reader.rs (non-existent paths) | S (3h) | Neu |
| SEC-03 | Shell Command Centralization (4 Module → 1 Utility) | M (4h) | Lessons 2026-03-29 |
| SEC-04 | Centralized Input Validation Module | M (4h) | Neu |
| DEBT-01 | Issue-Hygiene: Duplikat #61/#70 schliessen, Labels nach arc42 | S (2h) | #61, #70 |
| DEBT-02 | DashboardMap + pipelineAdapter Legacy-Code entfernen | S (3h) | #62 |
| DEBT-03 | ConnectionLines Dead Code entfernen | XS (0.5h) | Neu |
| DEBT-04 | agentStore vs pipelineStore deduplizieren | M (5h) | Neu |
| DEBT-05 | Zustand Selektoren fuer editorStore | S (3h) | #68 follow-up |

**Velocity:** ~26h | **Definition of Done:**
- `npx tsc --noEmit` + `npm run build` gruen
- `cargo check` gruen
- Kein `innerHTML` ohne Sanitization
- Alle Shell-Commands ueber zentrale Utility
- GitHub Issues mit Labels versehen

**Abhaengigkeiten:** Keine. Kann sofort starten.

---

### Sprint 2: QA-Infrastruktur (14.04 – 24.04, 1.5 Wochen)

**Ziel:** Test-Coverage auf 70% heben, CI-Pipeline haerten, Security-Hardening abschliessen. Ergebnis: Jeder Commit wird automatisch geprueft.

| ID | Task | Size | Bezug |
|---|---|---|---|
| QA-01 | projectConfigStore Tests (0% → 80%) | M (8h) | Neu |
| QA-02 | Persistenz-Layer Tests (tauriStorage + settings.rs) | M (8h) | #60 follow-up |
| QA-03 | Component-Tests schreiben bis Coverage 70% | L (15h) | #66 |
| QA-04 | Editor-Komponenten Tests (Toolbar, Preview, View) | M (4h) | #68 follow-up |
| DEVOPS-01 | CI Coverage Gate Enforcement (70% Schwelle) | S (3h) | #71 follow-up |
| DEVOPS-02 | Dependency Audit in CI (npm audit + cargo audit) | S (3h) | #57 follow-up |
| DEVOPS-03 | Branch Protection Rules (PR required, checks must pass) | S (2h) | Neu |
| SEC-05 | Rate Limiting fuer GitHub API Commands | M (4h) | Neu |
| SEC-06 | IPC Command Rate Limiting | M (4h) | Neu |
| SEC-07 | Secrets Detection in Settings | M (4h) | Neu |

**Velocity:** ~55h (1.5 Wochen) | **Definition of Done:**
- Coverage >= 70% Statements/Functions/Lines, >= 50% Branches
- CI blockiert PRs bei Coverage-Drop
- `npm audit` + `cargo audit` in CI
- Branch Protection aktiv auf `master`
- Rate Limiting mit Tests

**Abhaengigkeiten:**
- QA-03 haengt von Sprint 1 Cleanup ab (weniger tote Imports = weniger falsche Coverage-Luecken)
- DEVOPS-01 haengt von QA-03 ab (erst Coverage heben, dann Gate setzen)

---

### Sprint 3: v2.0 Foundation (28.04 – 09.05, 2 Wochen)

**Ziel:** Architekturelle Grundlagen fuer v2.0 legen: Cross-Session Agent Tracking, Audit-Log, Real-Mode Pipeline Basics, E2E-Test-Infrastruktur.

| ID | Task | Size | Bezug |
|---|---|---|---|
| FEAT-01 | Cross-Session Agent Tracking (GlobalAgentRegistry in Rust) | L (20h) | US-P4, Neu |
| FEAT-02 | Audit-Log Infrastruktur (Structured Events → Datei) | L (15h) | US-A4, Neu |
| FEAT-03 | Real-Mode Pipeline Basics (Mock → echte Session-Daten) | L (15h) | US-O2, #12 |
| QA-05 | WebdriverIO + tauri-driver E2E Setup | L (12h) | Neu |
| QA-06 | 8 Smoke-Tests (App-Start, Session, Terminal, Config-Tabs) | M (8h) | Neu |

**Velocity:** ~70h (2 Wochen) | **Definition of Done:**
- GlobalAgentRegistry: Agents ueber Sessions hinweg trackbar, Events emittiert
- Audit-Log: Mindestens Session-Start/Stop, Agent-Erkennung, Fehler geloggt
- Real-Mode: Pipeline-View zeigt echte Daten statt Mock
- E2E: `npm run test:e2e` laeuft mit mindestens 8 Smoke-Tests
- Alle bestehenden Tests weiterhin gruen

**Abhaengigkeiten:**
- FEAT-01 → braucht sauberen agentStore (Sprint 1 DEBT-04)
- FEAT-03 → braucht FEAT-01 (echte Agent-Daten)
- QA-06 → braucht QA-05 (E2E-Setup zuerst)

---

### Sprint 4: v2.0 Features + Release (12.05 – 23.05, 2 Wochen)

**Ziel:** User-facing Features auf Foundation aufbauen, UI polieren, v2.0 releasen.

| ID | Task | Size | Bezug |
|---|---|---|---|
| FEAT-04 | Activity Timeline Komponente | M (8h) | Neu |
| FEAT-05 | Kanban mit pipelineStore verbinden | S (3h) | #17 follow-up |
| FEAT-06 | LogViewer Virtualisierung (react-window) | L (12h) | Neu |
| FEAT-07 | Loading/Error/Empty States fuer 6 Komponenten | M (10h) | #65 follow-up |
| FEAT-08 | SessionManagerView zerlegen (Refactoring) | L (12h) | #62 |
| SEC-08 | Library Item ID Validation | M (4h) | Neu |
| QA-07 | Regressionstests v2.0 Features | M (6h) | Neu |

**Velocity:** ~55h (2 Wochen) | **Definition of Done:**
- Activity Timeline zeigt Agent-Events chronologisch
- Kanban-Board reflektiert echte Pipeline-Daten
- LogViewer scrollt fluessig bei 10.000+ Zeilen
- Alle 6 Komponenten haben Loading/Error/Empty Zustaende
- SessionManagerView < 300 Zeilen nach Refactoring
- Coverage bleibt >= 70%
- **v2.0 Release-Tag + Changelog**

**Abhaengigkeiten:**
- FEAT-04 → braucht FEAT-02 (Audit-Log als Datenquelle)
- FEAT-06 → unabhaengig, kann parallel
- QA-07 → nach allen Features

---

## 4. Kanban-Board (Initialer Zustand)

```mermaid
block-beta
    columns 6

    A["Backlog"]:1
    B["In Planning"]:1
    C["Ready"]:1
    D["In Progress"]:1
    E["Review"]:1
    F["Done"]:1

    block:backlog:1
        b1["FEAT-01 Agent Track."]
        b2["FEAT-02 Audit-Log"]
        b3["FEAT-03 Real-Mode"]
        b4["FEAT-04 Timeline"]
        b5["FEAT-05 Kanban"]
        b6["FEAT-06 LogViewer"]
        b7["FEAT-07 States"]
        b8["FEAT-08 SM Refactor"]
        b9["QA-01..07"]
        b10["DEVOPS-01..03"]
        b11["SEC-05..08"]
    end

    block:planning:1
        p1["SEC-01 XSS Fix"]
        p2["SEC-02 Path Trav."]
        p3["SEC-03 Shell Centr."]
        p4["SEC-04 Input Valid."]
    end

    block:ready:1
        r1["DEBT-01 Issue-Hyg."]
        r2["DEBT-02 Legacy Rm"]
        r3["DEBT-03 Dead Code"]
        r4["DEBT-04 Store Dedup"]
        r5["DEBT-05 Selektoren"]
    end

    block:progress:1
        ip1["—"]
    end

    block:review:1
        rv1["—"]
    end

    block:done:1
        d1["v1.4.0 Release"]
    end
```

---

## 5. Risiken und Mitigationen

| Risiko | Impact | Mitigation |
|---|---|---|
| Coverage 70% nicht erreichbar in 1.5 Wochen | Sprint 2 verzoegert | Schwelle auf 60% senken, Rest in Sprint 3 nachholen |
| WebdriverIO + Tauri-Driver Kompatibilitaet | E2E-Setup blockiert | Fallback: Playwright mit HTTP-Bridge |
| GlobalAgentRegistry Komplexitaet (Rust) | Sprint 3 Overrun | MVP: nur Session-uebergreifende Map, kein Persistence |
| Store-Deduplizierung bricht bestehende Tests | Sprint 1 Instabilitaet | Erst Tests lesen, dann refactorn. Feature-Flag falls noetig |

---

## 6. Metriken pro Sprint

| Metrik | Sprint 1 | Sprint 2 | Sprint 3 | Sprint 4 |
|---|---|---|---|---|
| Test-Coverage | Baseline halten | >= 70% | >= 70% | >= 70% |
| Offene Security-Issues | 0 | 0 | 0 | 0 |
| Offene Bugs | <= 2 | <= 2 | <= 3 | 0 |
| E2E-Tests | — | — | >= 8 | >= 12 |
| Build-Zeit | Baseline | Baseline | < 90s | < 90s |

---

*Erstellt: 2026-04-04 | Naechste Review: Sprint 1 Retro (2026-04-11)*
