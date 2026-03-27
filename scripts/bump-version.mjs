import { readFileSync, writeFileSync } from "fs";
import { execSync } from "child_process";
import { join } from "path";

const root = join(import.meta.dirname, "..");

// --- 1. Read current version ---
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf-8"));
const [major, minor, patch] = pkg.version.split(".").map(Number);
const oldVersion = pkg.version;
const newVersion = `${major}.${minor}.${patch + 1}`;

// --- 2. Bump in all 3 files ---
const files = [
  {
    path: join(root, "package.json"),
    replace: (content) =>
      content.replace(`"version": "${oldVersion}"`, `"version": "${newVersion}"`),
  },
  {
    path: join(root, "src-tauri", "Cargo.toml"),
    replace: (content) =>
      content.replace(`version = "${oldVersion}"`, `version = "${newVersion}"`),
  },
  {
    path: join(root, "src-tauri", "tauri.conf.json"),
    replace: (content) =>
      content.replace(`"version": "${oldVersion}"`, `"version": "${newVersion}"`),
  },
];

for (const file of files) {
  const content = readFileSync(file.path, "utf-8");
  const updated = file.replace(content);
  if (updated === content) {
    console.warn(`  WARN: Version ${oldVersion} nicht gefunden in ${file.path}`);
  }
  writeFileSync(file.path, updated);
}

// --- 3. Collect commits since last tag for CHANGELOG ---
const today = new Date().toISOString().split("T")[0];
let commits;
try {
  const lastTag = execSync("git describe --tags --abbrev=0", { encoding: "utf-8" }).trim();
  commits = execSync(`git log ${lastTag}..HEAD --pretty=format:"- %s"`, {
    encoding: "utf-8",
  }).trim();
} catch {
  commits = execSync('git log --pretty=format:"- %s" -20', { encoding: "utf-8" }).trim();
}

if (!commits) {
  commits = "- Patch-Release";
}

// Parse commits into categories (Conventional Commits)
const categories = { Features: [], Fixes: [], Backend: [], Sonstiges: [] };
for (const line of commits.split("\n")) {
  const msg = line.replace(/^- /, "");
  if (/^feat/i.test(msg)) {
    categories.Features.push(`- ${msg.replace(/^feat\([^)]*\):\s*/, "")}`);
  } else if (/^fix/i.test(msg)) {
    categories.Fixes.push(`- ${msg.replace(/^fix\([^)]*\):\s*/, "")}`);
  } else if (/^chore|^refactor|^docs|^ci|^build/i.test(msg)) {
    categories.Sonstiges.push(`- ${msg}`);
  } else {
    categories.Sonstiges.push(`- ${msg}`);
  }
}

// Build changelog entry
let entry = `## [${newVersion}] — ${today}\n`;
for (const [cat, items] of Object.entries(categories)) {
  if (items.length > 0) {
    entry += `\n### ${cat}\n${items.join("\n")}\n`;
  }
}

// --- 4. Prepend to CHANGELOG.md ---
const changelogPath = join(root, "CHANGELOG.md");
const changelog = readFileSync(changelogPath, "utf-8");
const insertPoint = changelog.indexOf("\n## [");
if (insertPoint !== -1) {
  const before = changelog.slice(0, insertPoint);
  const after = changelog.slice(insertPoint);
  writeFileSync(changelogPath, `${before}\n\n${entry}${after}`);
} else {
  writeFileSync(changelogPath, `${changelog}\n\n${entry}`);
}

// --- 5. Git tag ---
console.log(`\n  Version: ${oldVersion} → ${newVersion}`);
console.log(`  CHANGELOG aktualisiert`);
console.log(`  Bitte committen und taggen:`);
console.log(`    git add -A && git commit -m "chore(config): bump version to ${newVersion}"`);
console.log(`    git tag v${newVersion}\n`);
