/**
 * Error Logging Service
 *
 * Captures errors with timestamp, severity, source, message, and stack.
 * Operates in-memory with console output. No Tauri fs plugin dependency.
 * Keeps last 100 entries for UI display via getRecentLogs().
 */

export type LogSeverity = "error" | "warn" | "info";

export interface LogEntry {
  timestamp: string;
  severity: LogSeverity;
  source: string;
  message: string;
  stack?: string;
}

const MAX_BUFFER_SIZE = 100;
const logBuffer: LogEntry[] = [];

type LogSubscriber = (entry: LogEntry) => void;
let subscriber: LogSubscriber | null = null;

export function subscribeToLogs(cb: LogSubscriber): () => void {
  subscriber = cb;
  return () => {
    if (subscriber === cb) subscriber = null;
  };
}

function formatEntry(entry: LogEntry): string {
  return `[${entry.timestamp}] [${entry.severity.toUpperCase()}] [${entry.source}] ${entry.message}`;
}

function addEntry(entry: LogEntry): void {
  logBuffer.push(entry);
  if (logBuffer.length > MAX_BUFFER_SIZE) {
    logBuffer.shift();
  }

  // Notify subscriber
  subscriber?.(entry);

  // Mirror to console (intentional — this IS the logging sink)
  const formatted = formatEntry(entry);
  switch (entry.severity) {
    case "error":
      console.error(formatted, entry.stack ?? ""); // eslint-disable-line no-console
      break;
    case "warn":
      console.warn(formatted); // eslint-disable-line no-console
      break;
    case "info":
      console.info(formatted); // eslint-disable-line no-console
      break;
  }
}

function extractMessage(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) {
    return { message: error.message, stack: error.stack };
  }
  if (typeof error === "string") {
    return { message: error };
  }
  try {
    return { message: JSON.stringify(error) };
  } catch {
    return { message: String(error) };
  }
}

export function logError(source: string, error: unknown): void {
  const { message, stack } = extractMessage(error);
  addEntry({
    timestamp: new Date().toISOString(),
    severity: "error",
    source,
    message,
    stack,
  });
}

export function logWarn(source: string, message: string): void {
  addEntry({
    timestamp: new Date().toISOString(),
    severity: "warn",
    source,
    message,
  });
}

export function logInfo(source: string, message: string): void {
  addEntry({
    timestamp: new Date().toISOString(),
    severity: "info",
    source,
    message,
  });
}

export function getRecentLogs(): readonly LogEntry[] {
  return logBuffer;
}

export function clearLogs(): void {
  logBuffer.length = 0;
}
