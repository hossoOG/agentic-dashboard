# Sprint-Plan: v1.5 → v1.6 → v2.0

> **Stand:** 2026-04-08 | **Basis:** v1.6.0 | **PO-Vorgabe:** Plan-First, GitHub Issues
> **Kapazitaet:** 1 Entwickler, ~6h/Tag effektiv

---

## 0. Abschluss-Report Sprint 1+2 (v1.5 / v1.6)

### Ergebnis

Sprint 1 und 2 sind **abgeschlossen und released** als v1.4.1, v1.5.0, v1.5.1 und v1.6.0.

```mermaid
gantt
    title Sprint 1+2 — Tatsaechlicher Verlauf
    dateFormat  YYYY-MM-DD
    axisFormat  %d.%m

    section Sprint 1 — Security + Debt
    SEC-01 DOMPurify XSS             :done, s1_1, 2026-04-04, 1d
    SEC-02 Path Traversal            :done, s1_2, 2026-04-04, 1d
    SEC-03 Shell Centralization      :done, s1_3, 2026-04-04, 1d
    SEC-04 Input Validation          :done, s1_4, 2026-04-04, 1d
    DEBT-01 Label-Hygiene            :done, s1_5, 2026-04-04, 1d
    DEBT-02 DashboardMap Legacy      :done, s1_6, 2026-04-04, 1d
    DEBT-03 ConnectionLines          :done, s1_7, 2026-04-04, 1d
    DEBT-05 Zustand Selektoren       :done, s1_9, 2026-04-04, 1d
    v1.4.1 Release                   :milestone, v141, 2026-04-04, 0d
    v1.5.0 Release                   :milestone, v150, 2026-04-05, 0d

    section Sprint 2 — QA + Features
    QA-10 Component-Tests            :done, s2_1, 2026-04-05, 2d
    QA-11 Editor-Tests               :done, s2_2, 2026-04-05, 1d
    QA-15 Coverage 75%               :done, s2_3, 2026-04-06, 1d
    QA-16 Rust Integration Tests     :done, s2_4, 2026-04-06, 1d
    DEVOPS-02 Dependency Audit       :done, s2_5, 2026-04-05, 1d
    DEVOPS-04 Release-Workflow       :done, s2_6, 2026-04-05, 1d
    Frontend-Review (5 Experten)     :done, s2_7, 2026-04-06, 1d
    8 Bug-Fixes aus Review           :done, s2_8, 2026-04-06, 1d
    Library-Ansicht komplett         :done, s2_9, 2026-04-06, 1d
    v1.6.0 Release                   :milestone, v160, 2026-04-07, 0d
```

### Metriken

| Metrik | Start (v1.4.0) | Ende (v1.6.0) | Delta |
|--------|---------------|--------------|-------|
| Frontend-Tests | 472 | 912 | +440 (+93%) |
| Rust-Tests | 60 | 111 | +51 (+85%) |
| Coverage | 24% | 83% | +59pp |
| Coverage-Schwellen | 24/32/58/24 | 75/75/65/75 | Enforced |
| Offene Issues | 24 | 4 | -20 |
| Releases | v1.4.0 | v1.6.0 | 5 Releases in 4 Tagen |
| Dead Code entfernt | — | 730+ LOC | DashboardMap, ConnectionLines |

### Zusaetzliche Arbeit (nicht im Original-Plan)

- Frontend-Review mit 5 Experten-Personas → 8 Bug-Fixes
- Library-Ansicht komplett neu (Skills, Agents, Hooks, Configs)
- Error-Grouping + Log-Virtualisierung
- UI-Polish: Umlaute, WCAG AA Light-Mode, CTA-Buttons
- Session-Status-Farben korrigiert
- Parallel-Implement Skill gebaut und eingesetzt

---

## 1. Sprint-Uebersicht v2.0 (Gantt)

```mermaid
gantt
    title AgenticExplorer v2.0 Roadmap
    dateFormat  YYYY-MM-DD
    axisFormat  %d.%m

    section Sprint 3 — v2.0 Foundation
    FEAT-01 Cross-Session Tracking   :s3_1, 2026-04-14, 4d
    FEAT-02 Audit-Log Infrastruktur  :s3_2, 2026-04-18, 3d
    FEAT-03 Real-Mode Pipeline       :s3_3, 2026-04-21, 3d
    QA-05 E2E Setup WebdriverIO      :s3_4, 2026-04-14, 3d
    QA-06 8 Smoke-Tests              :s3_5, 2026-04-17, 2d
    Sprint 3 Review                  :milestone, s3_rev, 2026-04-25, 0d

    section Sprint 4 — v2.0 Features
    FEAT-04 Activity Timeline        :s4_1, 2026-04-28, 2d
    FEAT-05 Parallel Agent Dashboard :s4_2, 2026-04-28, 2d
    FEAT-06 Workflow-Profile UI      :s4_3, 2026-04-30, 2d
    FEAT-07 Loading/Error States     :s4_4, 2026-05-02, 2d
    QA-07 Regressionstests v2.0      :s4_5, 2026-05-05, 1d
    v2.0 Release                     :milestone, v2_rel, 2026-05-06, 0d
```

---

## 2. Swimlane-Diagramm

```mermaid
graph TD
    subgraph S3["Sprint 3: v2.0 Foundation (14.04–25.04)"]
        direction LR
        S3_FEAT["Features:<br/>FEAT-01 Agent Tracking (L)<br/>FEAT-02 Audit-Log (L)<br/>FEAT-03 Real-Mode (L)"]
        S3_QA["QA:<br/>QA-05 E2E Setup (L)<br/>QA-06 Smoke-Tests (M)"]
    end

    subgraph S4["Sprint 4: v2.0 Features (28.04–06.05)"]
        direction LR
        S4_FEAT["Features:<br/>FEAT-04 Timeline (M)<br/>FEAT-05 Dashboard (M)<br/>FEAT-06 Workflows (M)<br/>FEAT-07 States (S)"]
        S4_QA["QA:<br/>QA-07 Regression (M)<br/>Release v2.0"]
    end

    S3 --> S4

    style S3 fill:#fff3e0
    style S4 fill:#f1f8e9
```

---

## 3. Sprint-Details

### Sprint 3: v2.0 Foundation (14.04–25.04, 2 Wochen)

**Ziel:** Architekturelle Grundlagen fuer v2.0: Cross-Session Agent Tracking, Audit-Logs, Real-Mode Pipeline, E2E-Infrastruktur.

| ID | Task | Size | Beschreibung |
|---|---|---|---|
| FEAT-01 | Cross-Session Agent Tracking | L (20h) | GlobalAgentRegistry in Rust, session-uebergreifende Selektoren |
| FEAT-02 | Audit-Log Infrastruktur | L (15h) | Strukturierte Events nach AppData/audit.jsonl, Rotation |
| FEAT-03 | Real-Mode Pipeline | L (15h) | Mock durch echte Session-Daten ersetzen, Real/Mock Toggle |
| QA-05 | WebdriverIO + tauri-driver Setup | L (12h) | E2E-Testinfrastruktur aufsetzen |
| QA-06 | 8 Smoke-Tests | M (8h) | App-Start, Session, Terminal, Config, Theme, Favoriten, Navigation, Toast |

**Velocity:** ~70h | **Definition of Done:**
- GlobalAgentRegistry: Agents session-uebergreifend trackbar
- Audit-Log: Session-Start/Stop, Agent-Events persistent
- Real-Mode: Pipeline-View zeigt echte Daten
- E2E: `npm run test:e2e` mit 8 Smoke-Tests

**Abhaengigkeiten:**
- FEAT-03 braucht FEAT-01 (echte Agent-Daten)
- QA-06 braucht QA-05 (E2E-Setup zuerst)

---

### Sprint 4: v2.0 Features + Release (28.04–06.05, 1.5 Wochen)

**Ziel:** User-facing Features auf Foundation aufbauen, v2.0 releasen.

| ID | Task | Size | Beschreibung |
|---|---|---|---|
| FEAT-04 | Activity Timeline | M (8h) | Chronologische Ansicht aller Agent-Events |
| FEAT-05 | Parallel Agent Dashboard | M (10h) | Kanban-Board fuer Agent-Status (Pending/Running/Done/Error) |
| FEAT-06 | Workflow-Profile UI | M (10h) | Skills/Hooks erkennen, "Start Workflow" Button |
| FEAT-07 | Loading/Error/Empty States | S (6h) | Polish fuer 6 Komponenten |
| QA-07 | Regressionstests v2.0 | M (8h) | Bestehende + neue Tests, E2E-Suite erweitern |

**Velocity:** ~42h | **Release-Kriterien:**
- 912+ Tests, 75%+ Coverage
- E2E Smoke-Tests gruen
- Security-Review abgeschlossen
- v2.0 Roadmap-Features implementiert

---

## 4. Kanban-Board (Aktueller Stand)

```mermaid
graph LR
    subgraph Done["Done (v1.6.0)"]
        D1["SEC-01..04"]
        D2["DEBT-01..05"]
        D3["QA-10..16"]
        D4["DEVOPS-02,04"]
        D5["20 weitere Issues"]
    end

    subgraph Backlog["Backlog (v2.0)"]
        B1["FEAT-01 Agent Tracking"]
        B2["FEAT-02 Audit-Log"]
        B3["FEAT-03 Real-Mode"]
        B4["FEAT-04 Timeline"]
        B5["FEAT-05 Dashboard"]
        B6["FEAT-06 Workflows"]
        B7["FEAT-07 States"]
        B8["QA-05 E2E Setup"]
        B9["QA-06 Smoke-Tests"]
        B10["QA-07 Regression"]
    end

    subgraph Later["Spaeter (v3.0+)"]
        L1["#15 Gamification"]
        L2["#14 Graph-Viz"]
    end
```

---

## 5. Risiken

| Risiko | Impact | Mitigation |
|---|---|---|
| GlobalAgentRegistry Komplexitaet (Rust) | Sprint 3 Overrun | MVP: nur session-uebergreifende Map, kein Persistence |
| WebdriverIO + tauri-driver Kompatibilitaet | E2E blockiert | Fallback: Playwright mit HTTP-Bridge |
| Real-Mode Performance bei 50+ Agents | UI-Lag | Virtual Scrolling fuer Agent-Panel |
| Feature-Scope-Creep in Sprint 4 | Release verzoegert | Strict Scope: nur geplante FEAT-04..07 |
