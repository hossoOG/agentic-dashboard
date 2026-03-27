import { copyFileSync, readFileSync, readdirSync, unlinkSync } from "fs";
import { join, basename } from "path";
import { homedir } from "os";
import { execSync } from "child_process";

const pkg = JSON.parse(readFileSync(join(import.meta.dirname, "..", "package.json"), "utf-8"));
const version = pkg.version;
const appName = "AgenticExplorer";

// --- 1. Check if any AgenticExplorer process is running ---
try {
  const tasks = execSync(`tasklist /FI "IMAGENAME eq ${appName}*" /NH`, { encoding: "utf-8" });
  if (tasks.includes(appName)) {
    console.error(`\n  ✖ ${appName} läuft noch!`);
    console.error(`  Bitte die App schliessen bevor du deployst.\n`);
    process.exit(1);
  }
} catch {
  // tasklist not available or no match — safe to proceed
}

// --- 2. Clean up old versions on Desktop ---
const desktop = join(homedir(), "Desktop");
try {
  const oldFiles = readdirSync(desktop).filter(
    (f) => f.startsWith(appName) && f.endsWith(".exe") && f !== `${appName}-${version}.exe`
  );
  for (const old of oldFiles) {
    try {
      unlinkSync(join(desktop, old));
      console.log(`  Alte Version entfernt: ${old}`);
    } catch {
      console.warn(`  WARN: Konnte ${old} nicht entfernen (evtl. noch gesperrt)`);
    }
  }
} catch {
  // Desktop listing failed — skip cleanup
}

// --- 3. Copy new version ---
// Cargo binary name is "agentic-dashboard" (from Cargo.toml [package].name),
// not the Tauri productName "AgenticExplorer"
const src = join("src-tauri", "target", "release", "agentic-dashboard.exe");
const dest = join(desktop, `${appName}-${version}.exe`);

try {
  copyFileSync(src, dest);
  console.log(`\n  ✔ ${appName}-${version}.exe → Desktop\n`);
} catch (err) {
  console.error(`\n  ✖ Kopieren fehlgeschlagen: ${err.message}\n`);
  process.exit(1);
}
