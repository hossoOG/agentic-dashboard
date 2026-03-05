import { usePipelineStore } from "./pipelineStore";
import type { WorktreeStep } from "./pipelineStore";

const QA_CHECK_FAILURE_RATE = 0.15;

const STEPS: WorktreeStep[] = [
  "setup",
  "plan",
  "validate",
  "code",
  "review",
  "self_verify",
  "draft_pr",
];

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function startMockPipeline(): Promise<void> {
  const store = usePipelineStore.getState();
  store.reset();
  store.setIsRunning(true);

  // Phase 1: Orchestrator planning
  store.setOrchestratorStatus("planning");
  store.addOrchestratorLog("🔍 Scanning repository for open issues...");
  await delay(1200);
  store.addOrchestratorLog("📋 Found 3 actionable issues: #42, #47, #51");
  await delay(800);
  store.addOrchestratorLog("⚙️ Generating SPAWN_MANIFEST...");
  await delay(1000);

  // Phase 2: Generate manifest
  store.setOrchestratorStatus("generated_manifest");
  store.addOrchestratorLog("✅ SPAWN_MANIFEST generated — 3 worktrees");
  await delay(600);

  // Phase 3: Spawn worktrees
  const worktrees = [
    { id: "wt-1", branch: "fix/issue-42-auth-bug", issue: "#42 Fix auth token expiry" },
    { id: "wt-2", branch: "feat/issue-47-dashboard", issue: "#47 Add user dashboard" },
    { id: "wt-3", branch: "fix/issue-51-perf", issue: "#51 Performance regression" },
  ];

  for (const wt of worktrees) {
    store.spawnWorktree(wt.id, wt.branch, wt.issue);
    store.addOrchestratorLog(`🌿 Spawned worktree: ${wt.branch}`);
    await delay(400);
  }

  // Phase 4: Run each worktree through steps (interleaved)
  const stepLogs: Record<WorktreeStep, string[]> = {
    setup: ["git worktree add ...", "npm install", "Environment ready ✓"],
    plan: ["Reading issue context...", "Generating implementation plan...", "Plan validated ✓"],
    validate: ["Running plan-validator...", "Checking feasibility...", "Plan approved ✓"],
    code: ["Implementing changes...", "Writing tests...", "Code complete ✓"],
    review: ["Running self-review...", "Checking code quality...", "Review passed ✓"],
    self_verify: ["npx vitest run --reporter=verbose", "All tests passing ✓", "npx tsc --noEmit"],
    draft_pr: ["Creating PR draft...", "Updating PR description...", "PR ready for review ✓"],
  };

  for (let stepIdx = 0; stepIdx < STEPS.length; stepIdx++) {
    const step = STEPS[stepIdx];
    const logs = stepLogs[step];

    // Start all worktrees on this step
    for (const wt of worktrees) {
      store.updateWorktreeStep(wt.id, step);
      store.updateWorktreeStatus(wt.id, "active");
    }

    // Add logs progressively
    for (const log of logs) {
      for (const wt of worktrees) {
        store.addWorktreeLog(wt.id, `[${step}] ${log}`);
      }
      await delay(600);
    }

    await delay(400);
  }

  // Mark all done
  for (const wt of worktrees) {
    store.updateWorktreeStatus(wt.id, "done");
  }

  // Phase 5: QA Gate
  store.setQAOverallStatus("running");
  await delay(500);

  const checks: Array<{ key: "unitTests" | "typeCheck" | "lint" | "build" | "e2e"; label: string }> = [
    { key: "unitTests", label: "Unit Tests" },
    { key: "typeCheck", label: "TypeCheck" },
    { key: "lint", label: "Lint" },
    { key: "build", label: "Build" },
    { key: "e2e", label: "E2E Tests" },
  ];

  for (const check of checks) {
    store.updateQACheck(check.key, "running");
    await delay(800 + Math.random() * 600);
    store.updateQACheck(check.key, Math.random() > QA_CHECK_FAILURE_RATE ? "pass" : "fail");
  }

  const { qaGate } = usePipelineStore.getState();
  const allPassed = Object.values(qaGate).every(
    (v) => v === "pass" || v === "idle" || v === "running"
  );
  store.setQAOverallStatus(allPassed ? "pass" : "fail");
  store.setIsRunning(false);
}
