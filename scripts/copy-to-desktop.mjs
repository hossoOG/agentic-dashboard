import { copyFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const src = join("src-tauri", "target", "release", "agentic-dashboard.exe");
const dest = join(homedir(), "Desktop", "agentic-dashboard.exe");

try {
  copyFileSync(src, dest);
  console.log(`\n  Kopiert nach: ${dest}\n`);
} catch (err) {
  console.error(`\n  Kopieren fehlgeschlagen: ${err.message}\n`);
  process.exit(1);
}
