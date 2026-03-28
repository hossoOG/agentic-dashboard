import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { parseSkillFrontmatter } from "../utils/parseSkillFrontmatter";

// ============================================================================
// Types
// ============================================================================

export type WorkflowType = "skill" | "hook" | "composite";

export interface DetectedWorkflow {
  id: string;
  name: string;
  description: string;
  type: WorkflowType;
  source: string[];
  trigger?: string;
}

interface SkillDirEntry {
  dir_name: string;
  content: string;
  has_reference_dir: boolean;
}

interface HookEntry {
  matcher?: string;
  command: string;
}

// ============================================================================
// State Interface
// ============================================================================

export interface WorkflowState {
  workflows: Record<string, DetectedWorkflow[]>;
  loading: boolean;
  error: string | null;
  launchError: string | null;

  // Actions
  detectWorkflows: (folder: string) => Promise<void>;
  clearWorkflows: (folder: string) => void;
  setLaunchError: (error: string | null) => void;
}

// ============================================================================
// Helpers
// ============================================================================

async function detectSkillWorkflows(folder: string): Promise<DetectedWorkflow[]> {
  const workflows: DetectedWorkflow[] = [];

  let dirSkillsFound = false;
  try {
    const dirs = await invoke<SkillDirEntry[]>("list_skill_dirs", { folder });
    for (const dir of dirs) {
      dirSkillsFound = true;
      const parsed = parseSkillFrontmatter(dir.content);
      const name = parsed.metadata.name !== "Unknown"
        ? parsed.metadata.name
        : dir.dir_name;

      workflows.push({
        id: `skill-${dir.dir_name}`,
        name,
        description: parsed.metadata.description || `Skill: ${dir.dir_name}`,
        type: "skill",
        source: [`.claude/skills/${dir.dir_name}/SKILL.md`],
        trigger: parsed.metadata.userInvokable
          ? `/${dir.dir_name}`
          : undefined,
      });
    }
  } catch {
    // list_skill_dirs not available or failed — fall through to legacy
  }

  // Also check for flat .md files in .claude/skills/ (legacy layout or mixed)
  // Only if no directory-based skills were found, to avoid duplicates
  if (!dirSkillsFound) {
    try {
      const files = await invoke<string[]>("list_project_dir", {
        folder,
        relativePath: ".claude/skills",
      });
      const mdFiles = files.filter((f) => f.endsWith(".md"));
      for (const file of mdFiles) {
        try {
          const content = await invoke<string>("read_project_file", {
            folder,
            relativePath: `.claude/skills/${file}`,
          });
          const parsed = parseSkillFrontmatter(content);
          const skillName = parsed.metadata.name !== "Unknown"
            ? parsed.metadata.name
            : file.replace(/\.md$/, "");

          workflows.push({
            id: `skill-${file}`,
            name: skillName,
            description: parsed.metadata.description || `Skill: ${file}`,
            type: "skill",
            source: [`.claude/skills/${file}`],
            trigger: parsed.metadata.userInvokable
              ? `/${file.replace(/\.md$/, "")}`
              : undefined,
          });
        } catch {
          // Skip unreadable files
        }
      }
    } catch {
      // No skills directory
    }
  }

  return workflows;
}

async function detectHookWorkflows(folder: string): Promise<DetectedWorkflow[]> {
  const workflows: DetectedWorkflow[] = [];

  // Read project settings.json for hooks
  try {
    const raw = await invoke<string>("read_project_file", {
      folder,
      relativePath: ".claude/settings.json",
    });

    if (raw) {
      const parsed = JSON.parse(raw);
      const hooks = parsed?.hooks;
      if (hooks && typeof hooks === "object") {
        for (const [eventName, hookList] of Object.entries(hooks)) {
          const entries = hookList as HookEntry[];
          if (!Array.isArray(entries) || entries.length === 0) continue;

          const commands = entries.map((h) => h.command).filter(Boolean);
          workflows.push({
            id: `hook-${eventName}`,
            name: formatHookEventName(eventName),
            description: `${entries.length} Hook(s): ${commands.join(", ").slice(0, 80)}`,
            type: "hook",
            source: [".claude/settings.json"],
            trigger: eventName,
          });
        }
      }
    }
  } catch {
    // No settings.json or parse error
  }

  return workflows;
}

function formatHookEventName(event: string): string {
  // Convert e.g. "PreCommit" to "Pre-Commit Hook"
  const spaced = event.replace(/([a-z])([A-Z])/g, "$1-$2");
  return `${spaced} Hook`;
}

function deriveCompositeWorkflows(
  skills: DetectedWorkflow[],
  hooks: DetectedWorkflow[]
): DetectedWorkflow[] {
  const composites: DetectedWorkflow[] = [];

  // If both skills and hooks exist, derive composite workflows
  if (skills.length === 0 || hooks.length === 0) return composites;

  const hasImplementSkill = skills.some(
    (s) => s.trigger === "/implement" || s.name.toLowerCase().includes("implement")
  );
  // Claude hook events: PreToolUse, PostToolUse, Notification, Stop, SubagentStop
  const hasPreToolUseHook = hooks.some(
    (h) => h.trigger === "PreToolUse"
  );
  const hasPostToolUseHook = hooks.some(
    (h) => h.trigger === "PostToolUse"
  );
  const hasValidationHooks = hasPreToolUseHook || hasPostToolUseHook;
  const hasBugfixSkill = skills.some(
    (s) => s.trigger === "/bugfix" || s.name.toLowerCase().includes("bugfix")
  );
  const hasReviewSkill = skills.some(
    (s) => s.trigger === "/review-pr" || s.name.toLowerCase().includes("review")
  );

  if (hasImplementSkill && hasValidationHooks) {
    const validationHooks = hooks.filter(
      (h) => h.trigger === "PreToolUse" || h.trigger === "PostToolUse"
    );
    composites.push({
      id: "composite-auto-implement",
      name: "Automatisierte Implementierung",
      description: "Implement-Skill mit Tool-Use-Validierung",
      type: "composite",
      source: [
        ...skills.filter((s) => s.trigger === "/implement").flatMap((s) => s.source),
        ...validationHooks.flatMap((h) => h.source),
      ],
      trigger: "/implement",
    });
  }

  if (hasBugfixSkill && hasValidationHooks) {
    const validationHooks = hooks.filter(
      (h) => h.trigger === "PreToolUse" || h.trigger === "PostToolUse"
    );
    composites.push({
      id: "composite-auto-bugfix",
      name: "Automatisierter Bugfix",
      description: "Bugfix-Skill mit Tool-Use-Validierung",
      type: "composite",
      source: [
        ...skills.filter((s) => s.trigger === "/bugfix").flatMap((s) => s.source),
        ...validationHooks.flatMap((h) => h.source),
      ],
      trigger: "/bugfix",
    });
  }

  if (hasReviewSkill) {
    composites.push({
      id: "composite-review-pipeline",
      name: "Review-Pipeline",
      description: "Code-Review mit Skill-gesteuerter Analyse",
      type: "composite",
      source: skills.filter((s) => s.trigger === "/review-pr" || s.name.toLowerCase().includes("review")).flatMap((s) => s.source),
      trigger: "/review-pr",
    });
  }

  // Generic composite when skills + hooks both exist but no specific patterns match
  if (composites.length === 0) {
    composites.push({
      id: "composite-skill-hooks",
      name: "Skill + Hook Workflow",
      description: `${skills.length} Skill(s) mit ${hooks.length} Hook-Event(s) kombiniert`,
      type: "composite",
      source: [
        ...skills.flatMap((s) => s.source),
        ...hooks.flatMap((h) => h.source),
      ],
    });
  }

  return composites;
}

// ============================================================================
// Store
// ============================================================================

export const useWorkflowStore = create<WorkflowState>((set) => ({
  workflows: {},
  loading: false,
  error: null,
  launchError: null,

  setLaunchError: (error: string | null) => set({ launchError: error }),

  detectWorkflows: async (folder: string) => {
    if (!folder) return;

    set({ loading: true, error: null, launchError: null });

    try {
      const [skills, hooks] = await Promise.all([
        detectSkillWorkflows(folder),
        detectHookWorkflows(folder),
      ]);

      const composites = deriveCompositeWorkflows(skills, hooks);
      const all = [...composites, ...skills, ...hooks];

      set((state) => ({
        workflows: { ...state.workflows, [folder]: all },
        loading: false,
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err ?? "Unbekannter Fehler");
      set({ loading: false, error: message });
    }
  },

  clearWorkflows: (folder: string) =>
    set((state) => {
      const updated = { ...state.workflows };
      delete updated[folder];
      return { workflows: updated };
    }),
}));

// ============================================================================
// Selectors
// ============================================================================

export const selectWorkflowsForFolder = (folder: string) => (state: WorkflowState) =>
  state.workflows[folder] ?? [];

export const selectWorkflowsByType = (folder: string, type: WorkflowType) => (state: WorkflowState) =>
  (state.workflows[folder] ?? []).filter((w) => w.type === type);
