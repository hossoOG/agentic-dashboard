/** Format milliseconds into a human-readable duration string. */
export function formatElapsed(ms: number): string {
  if (ms < 1000) return "< 1s";
  const totalSec = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}
