/**
 * Agentic Dashboard Protocol (ADP) v1
 *
 * Einheitliches JSON-Kommunikationsprotokoll fuer den Austausch zwischen
 * allen Services im Agentic Dashboard. Jede Nachricht folgt dem gleichen
 * Envelope-Format, unabhaengig von Quelle oder Ziel.
 *
 * Design-Prinzipien:
 * - Jede Nachricht hat eine eindeutige ID (Idempotenz)
 * - Versionierung ueber das `version`-Feld im Envelope
 * - Erweiterbar durch neue Event-Typen ohne Breaking Changes
 * - Fehlerbehandlung und Retry-Semantik eingebaut
 */

// ============================================================================
// 1. ENVELOPE — Aeussere Huelle jeder Nachricht
// ============================================================================

export interface ADPEnvelope<T extends ADPPayload = ADPPayload> {
  /** Protokoll-Version, Semantic Versioning */
  version: "1.0.0";

  /** Eindeutige Nachrichten-ID (UUID v4) fuer Idempotenz und Deduplizierung */
  id: string;

  /** ISO-8601 Zeitstempel der Erstellung */
  timestamp: string;

  /** Quelle der Nachricht */
  source: ADPSource;

  /** Ziel der Nachricht (null = Broadcast an alle Listener) */
  target: ADPTarget | null;

  /** Event-Typ — bestimmt die Payload-Struktur */
  type: ADPEventType;

  /** Korrelations-ID fuer Request/Response-Ketten und Retry-Tracking */
  correlationId: string | null;

  /** Laufende Nummer fuer Ordering innerhalb einer Korrelation */
  sequence: number;

  /** Die eigentliche Nutzlast */
  payload: T;

  /** Metadaten fuer Debugging und Monitoring */
  meta: ADPMeta;
}

// ============================================================================
// 2. SOURCES & TARGETS — Wer spricht mit wem?
// ============================================================================

export type ADPSource =
  | { kind: "tauri-backend" }
  | { kind: "react-frontend" }
  | { kind: "claude-cli"; sessionId: string }
  | { kind: "external-service"; service: ExternalServiceType; instanceId?: string }
  | { kind: "terminal"; terminalId: string };

export type ADPTarget =
  | { kind: "tauri-backend" }
  | { kind: "react-frontend" }
  | { kind: "claude-cli"; sessionId?: string }
  | { kind: "external-service"; service: ExternalServiceType; instanceId?: string }
  | { kind: "terminal"; terminalId: string }
  | { kind: "broadcast" };

export type ExternalServiceType =
  | "github"
  | "calendar"
  | "midjourney"
  | "anthropic"
  | "openai"
  | "custom";

// ============================================================================
// 3. EVENT-TYPEN — Was wird kommuniziert?
// ============================================================================

export type ADPEventType =
  // Pipeline-Steuerung
  | "pipeline.start"
  | "pipeline.stop"
  | "pipeline.status"
  | "pipeline.error"

  // Orchestrator-Events
  | "orchestrator.status-change"
  | "orchestrator.log"
  | "orchestrator.manifest-generated"

  // Worktree-Events
  | "worktree.spawn"
  | "worktree.step-change"
  | "worktree.status-change"
  | "worktree.log"
  | "worktree.progress"

  // QA-Gate-Events
  | "qa.check-update"
  | "qa.overall-status"
  | "qa.report"

  // Terminal-Events
  | "terminal.spawn"
  | "terminal.input"
  | "terminal.output"
  | "terminal.exit"

  // Externe Services
  | "service.request"
  | "service.response"
  | "service.auth"
  | "service.cost-update"

  // System-Events
  | "system.heartbeat"
  | "system.error"
  | "system.config-change";

// ============================================================================
// 4. PAYLOADS — Typisierte Nutzlasten pro Event-Typ
// ============================================================================

export type ADPPayload =
  | PipelineStartPayload
  | PipelineStopPayload
  | PipelineStatusPayload
  | PipelineErrorPayload
  | OrchestratorStatusPayload
  | OrchestratorLogPayload
  | OrchestratorManifestPayload
  | WorktreeSpawnPayload
  | WorktreeStepPayload
  | WorktreeStatusPayload
  | WorktreeLogPayload
  | WorktreeProgressPayload
  | QACheckUpdatePayload
  | QAOverallStatusPayload
  | QAReportPayload
  | TerminalSpawnPayload
  | TerminalInputPayload
  | TerminalOutputPayload
  | TerminalExitPayload
  | ServiceRequestPayload
  | ServiceResponsePayload
  | ServiceAuthPayload
  | ServiceCostUpdatePayload
  | SystemHeartbeatPayload
  | SystemErrorPayload
  | SystemConfigChangePayload;

// --- Pipeline ---

export interface PipelineStartPayload {
  _type: "pipeline.start";
  projectPath: string;
  mode: "real" | "mock";
  config?: Record<string, unknown>;
}

export interface PipelineStopPayload {
  _type: "pipeline.stop";
  reason: "user-initiated" | "error" | "completed";
}

export interface PipelineStatusPayload {
  _type: "pipeline.status";
  isRunning: boolean;
  uptime: number; // Sekunden seit Start
  worktreeCount: number;
}

export interface PipelineErrorPayload {
  _type: "pipeline.error";
  error: ADPError;
}

// --- Orchestrator ---

export type OrchestratorState = "idle" | "planning" | "generated_manifest" | "executing" | "error";

export interface OrchestratorStatusPayload {
  _type: "orchestrator.status-change";
  previousStatus: OrchestratorState;
  newStatus: OrchestratorState;
}

export interface OrchestratorLogPayload {
  _type: "orchestrator.log";
  level: "debug" | "info" | "warn" | "error";
  message: string;
}

export interface OrchestratorManifestPayload {
  _type: "orchestrator.manifest-generated";
  worktrees: Array<{
    id: string;
    branch: string;
    issue: string;
    priority: number;
  }>;
}

// --- Worktree ---

export type WorktreeStep =
  | "setup"
  | "plan"
  | "validate"
  | "code"
  | "review"
  | "self_verify"
  | "draft_pr";

export type WorktreeStatus =
  | "idle"
  | "active"
  | "blocked"
  | "waiting_for_input"
  | "done"
  | "error";

export interface WorktreeSpawnPayload {
  _type: "worktree.spawn";
  worktreeId: string;
  branch: string;
  issue: string;
  priority: number;
  estimatedDuration?: number; // Sekunden
}

export interface WorktreeStepPayload {
  _type: "worktree.step-change";
  worktreeId: string;
  previousStep: WorktreeStep | null;
  newStep: WorktreeStep;
  stepStartedAt: string; // ISO-8601
}

export interface WorktreeStatusPayload {
  _type: "worktree.status-change";
  worktreeId: string;
  previousStatus: WorktreeStatus;
  newStatus: WorktreeStatus;
  reason?: string;
}

export interface WorktreeLogPayload {
  _type: "worktree.log";
  worktreeId: string;
  level: "debug" | "info" | "warn" | "error";
  message: string;
}

export interface WorktreeProgressPayload {
  _type: "worktree.progress";
  worktreeId: string;
  progress: number; // 0-100
  currentStep: WorktreeStep;
  completedSteps: WorktreeStep[];
}

// --- QA Gate ---

export type QACheckName = "unitTests" | "typeCheck" | "lint" | "build" | "e2e";
export type QACheckStatus = "pending" | "running" | "pass" | "fail" | "skipped";
export type QAOverallStatus = "idle" | "running" | "pass" | "fail";

export interface QACheckUpdatePayload {
  _type: "qa.check-update";
  check: QACheckName;
  previousStatus: QACheckStatus;
  newStatus: QACheckStatus;
  duration?: number; // Millisekunden
  details?: string;
}

export interface QAOverallStatusPayload {
  _type: "qa.overall-status";
  previousStatus: QAOverallStatus;
  newStatus: QAOverallStatus;
}

export interface QAReportPayload {
  _type: "qa.report";
  checks: Record<QACheckName, {
    status: QACheckStatus;
    duration: number;
    output?: string;
  }>;
  overallStatus: QAOverallStatus;
  generatedAt: string;
}

// --- Terminal ---

export interface TerminalSpawnPayload {
  _type: "terminal.spawn";
  terminalId: string;
  shell: "powershell" | "bash" | "cmd" | "zsh";
  workingDirectory: string;
  env?: Record<string, string>;
}

export interface TerminalInputPayload {
  _type: "terminal.input";
  terminalId: string;
  command: string;
}

export interface TerminalOutputPayload {
  _type: "terminal.output";
  terminalId: string;
  stream: "stdout" | "stderr";
  data: string;
}

export interface TerminalExitPayload {
  _type: "terminal.exit";
  terminalId: string;
  exitCode: number;
  signal?: string;
}

// --- Externe Services ---

export interface ServiceRequestPayload {
  _type: "service.request";
  service: ExternalServiceType;
  endpoint: string;
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  body?: unknown;
  headers?: Record<string, string>;
  retryPolicy?: ADPRetryPolicy;
}

export interface ServiceResponsePayload {
  _type: "service.response";
  service: ExternalServiceType;
  statusCode: number;
  body: unknown;
  duration: number; // Millisekunden
}

export interface ServiceAuthPayload {
  _type: "service.auth";
  service: ExternalServiceType;
  action: "token-stored" | "token-refreshed" | "token-expired" | "token-revoked";
  expiresAt?: string;
}

export interface ServiceCostUpdatePayload {
  _type: "service.cost-update";
  service: ExternalServiceType;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  cost: number; // USD
  currency: string;
  period: "request" | "session" | "daily" | "monthly";
}

// --- System ---

export interface SystemHeartbeatPayload {
  _type: "system.heartbeat";
  uptimeSeconds: number;
  memoryUsageMB: number;
  activeConnections: number;
}

export interface SystemErrorPayload {
  _type: "system.error";
  error: ADPError;
  recoverable: boolean;
}

export interface SystemConfigChangePayload {
  _type: "system.config-change";
  key: string;
  previousValue: unknown;
  newValue: unknown;
}

// ============================================================================
// 5. FEHLERBEHANDLUNG
// ============================================================================

export interface ADPError {
  /** Maschinenlesbarer Fehlercode */
  code: ADPErrorCode;

  /** Menschenlesbare Fehlerbeschreibung */
  message: string;

  /** Stack-Trace oder zusaetzliche Details (nur in dev) */
  details?: string;

  /** Ist der Fehler durch Retry behebbar? */
  retryable: boolean;

  /** Empfohlene Wartezeit vor Retry in Millisekunden */
  retryAfterMs?: number;
}

export type ADPErrorCode =
  | "PIPELINE_SPAWN_FAILED"
  | "PIPELINE_ALREADY_RUNNING"
  | "PIPELINE_NOT_RUNNING"
  | "WORKTREE_NOT_FOUND"
  | "WORKTREE_STEP_INVALID"
  | "QA_CHECK_TIMEOUT"
  | "TERMINAL_SPAWN_FAILED"
  | "TERMINAL_NOT_FOUND"
  | "SERVICE_AUTH_FAILED"
  | "SERVICE_REQUEST_FAILED"
  | "SERVICE_RATE_LIMITED"
  | "SERVICE_TIMEOUT"
  | "PARSE_ERROR"
  | "SCHEMA_VALIDATION_FAILED"
  | "UNKNOWN_EVENT_TYPE"
  | "INTERNAL_ERROR";

// ============================================================================
// 6. RETRY-POLICY
// ============================================================================

export interface ADPRetryPolicy {
  /** Maximale Anzahl Wiederholungen */
  maxRetries: number;

  /** Basis-Wartezeit in Millisekunden */
  baseDelayMs: number;

  /** Maximale Wartezeit in Millisekunden */
  maxDelayMs: number;

  /** Backoff-Strategie */
  strategy: "fixed" | "exponential" | "exponential-jitter";
}

export const DEFAULT_RETRY_POLICY: ADPRetryPolicy = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  strategy: "exponential-jitter",
};

// ============================================================================
// 7. METADATEN
// ============================================================================

export interface ADPMeta {
  /** Retry-Zaehler (0 = erster Versuch) */
  retryCount: number;

  /** Trace-ID fuer verteiltes Tracing (optional) */
  traceId?: string;

  /** Ausfuehrungsumgebung */
  environment: "development" | "production";

  /** Schema-Version des Payloads (fuer Forward-Compatibility) */
  payloadVersion?: string;
}

// ============================================================================
// 8. HILFSFUNKTIONEN
// ============================================================================

/**
 * Erstellt eine neue ADP-Nachricht mit automatisch generierten Feldern.
 */
export function createADPMessage<T extends ADPPayload>(
  type: ADPEventType,
  source: ADPSource,
  payload: T,
  options?: {
    target?: ADPTarget | null;
    correlationId?: string | null;
    sequence?: number;
    environment?: "development" | "production";
  }
): ADPEnvelope<T> {
  return {
    version: "1.0.0",
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    source,
    target: options?.target ?? null,
    type,
    correlationId: options?.correlationId ?? null,
    sequence: options?.sequence ?? 0,
    payload,
    meta: {
      retryCount: 0,
      environment: options?.environment ?? "development",
    },
  };
}

/**
 * Prueft ob eine Nachricht ein Duplikat ist (anhand der ID).
 * Verwendet ein LRU-artiges Set mit maximal 1000 Eintraegen.
 */
const processedIds = new Set<string>();
const MAX_PROCESSED_IDS = 1000;

export function isIdempotent(envelope: ADPEnvelope): boolean {
  if (processedIds.has(envelope.id)) {
    return false; // Duplikat
  }

  processedIds.add(envelope.id);

  // Einfaches Aufraumen bei Ueberschreitung
  if (processedIds.size > MAX_PROCESSED_IDS) {
    const iterator = processedIds.values();
    for (let i = 0; i < MAX_PROCESSED_IDS / 2; i++) {
      const val = iterator.next().value;
      if (val !== undefined) {
        processedIds.delete(val);
      }
    }
  }

  return true; // Neue Nachricht
}

/**
 * Berechnet die Retry-Wartezeit basierend auf der Policy.
 */
export function calculateRetryDelay(
  retryCount: number,
  policy: ADPRetryPolicy = DEFAULT_RETRY_POLICY
): number {
  if (retryCount >= policy.maxRetries) return -1; // Keine weiteren Retries

  let delay: number;
  switch (policy.strategy) {
    case "fixed":
      delay = policy.baseDelayMs;
      break;
    case "exponential":
      delay = policy.baseDelayMs * Math.pow(2, retryCount);
      break;
    case "exponential-jitter":
      delay = policy.baseDelayMs * Math.pow(2, retryCount);
      delay = delay * (0.5 + Math.random() * 0.5); // 50-100% Jitter
      break;
  }

  return Math.min(delay, policy.maxDelayMs);
}
