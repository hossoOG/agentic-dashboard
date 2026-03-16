import type {
  ADPEnvelope,
  ADPPayload,
  ADPSource,
  PipelineStartPayload,
  PipelineStopPayload,
  OrchestratorStatusPayload,
  OrchestratorLogPayload,
  OrchestratorManifestPayload,
  WorktreeSpawnPayload,
  WorktreeStepPayload,
  WorktreeStatusPayload,
  WorktreeLogPayload,
  QACheckUpdatePayload,
  QAOverallStatusPayload,
  WorktreeStep,
  QACheckName,
  QACheckStatus,
} from "../protocols/schema";
import { createADPMessage } from "../protocols/schema";

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

const STEP_LOGS: Record<WorktreeStep, string[]> = {
  setup: ["git worktree add ...", "npm install", "Environment ready"],
  plan: ["Reading issue context...", "Generating implementation plan...", "Plan validated"],
  validate: ["Running plan-validator...", "Checking feasibility...", "Plan approved"],
  code: ["Implementing changes...", "Writing tests...", "Code complete"],
  review: ["Running self-review...", "Checking code quality...", "Review passed"],
  self_verify: ["npx vitest run --reporter=verbose", "All tests passing", "npx tsc --noEmit"],
  draft_pr: ["Creating PR draft...", "Updating PR description...", "PR ready for review"],
};

const SOURCE: ADPSource = { kind: "react-frontend" };

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelay(): number {
  return 200 + Math.random() * 600;
}

function emit<T extends ADPPayload>(
  dispatch: (envelope: ADPEnvelope) => void,
  type: ADPEnvelope["type"],
  payload: T,
  correlationId?: string,
): void {
  const envelope = createADPMessage<ADPPayload>(type, SOURCE, payload, {
    correlationId: correlationId ?? null,
  });
  dispatch(envelope);
}

/**
 * Simuliert eine komplette Pipeline mit ADP-Envelopes.
 * Durchlaeuft alle Phasen: Start, Orchestrator Planning, Manifest,
 * Worktree-Spawning, interleaved Steps mit Logs, QA-Gate und Stop.
 */
export async function startMockPipelineADP(
  dispatch: (envelope: ADPEnvelope) => void,
): Promise<void> {
  const pipelineCorrelation = crypto.randomUUID();

  // === Phase 1: Pipeline Start ===
  const startPayload = {
    _type: "pipeline.start",
    projectPath: "/mock/agentic-dashboard",
    mode: "mock",
  } satisfies PipelineStartPayload;
  emit(dispatch, "pipeline.start", startPayload, pipelineCorrelation);
  await delay(300);

  // === Phase 2: Orchestrator Planning ===
  const orchPlanPayload = {
    _type: "orchestrator.status-change",
    previousStatus: "idle",
    newStatus: "planning",
  } satisfies OrchestratorStatusPayload;
  emit(dispatch, "orchestrator.status-change", orchPlanPayload, pipelineCorrelation);
  await delay(randomDelay());

  const logScan = {
    _type: "orchestrator.log",
    level: "info",
    message: "Scanning repository for open issues...",
  } satisfies OrchestratorLogPayload;
  emit(dispatch, "orchestrator.log", logScan, pipelineCorrelation);
  await delay(randomDelay());

  const logFound = {
    _type: "orchestrator.log",
    level: "info",
    message: "Found 3 actionable issues: #42, #47, #51",
  } satisfies OrchestratorLogPayload;
  emit(dispatch, "orchestrator.log", logFound, pipelineCorrelation);
  await delay(randomDelay());

  const logManifest = {
    _type: "orchestrator.log",
    level: "info",
    message: "Generating SPAWN_MANIFEST...",
  } satisfies OrchestratorLogPayload;
  emit(dispatch, "orchestrator.log", logManifest, pipelineCorrelation);
  await delay(randomDelay());

  // === Phase 3: Manifest Generated ===
  const worktreeDefs = [
    { id: "wt-1", branch: "fix/issue-42-auth-bug", issue: "#42 Fix auth token expiry", priority: 1 },
    { id: "wt-2", branch: "feat/issue-47-dashboard", issue: "#47 Add user dashboard", priority: 2 },
    { id: "wt-3", branch: "fix/issue-51-perf", issue: "#51 Performance regression", priority: 3 },
  ];

  const manifestPayload = {
    _type: "orchestrator.manifest-generated",
    worktrees: worktreeDefs.map((wt) => ({
      id: wt.id,
      branch: wt.branch,
      issue: wt.issue,
      priority: wt.priority,
    })),
  } satisfies OrchestratorManifestPayload;
  emit(dispatch, "orchestrator.manifest-generated", manifestPayload, pipelineCorrelation);
  await delay(randomDelay());

  const orchManifestPayload = {
    _type: "orchestrator.status-change",
    previousStatus: "planning",
    newStatus: "generated_manifest",
  } satisfies OrchestratorStatusPayload;
  emit(dispatch, "orchestrator.status-change", orchManifestPayload, pipelineCorrelation);
  await delay(randomDelay());

  // === Phase 4: Spawn Worktrees ===
  for (const wt of worktreeDefs) {
    const spawnPayload = {
      _type: "worktree.spawn",
      worktreeId: wt.id,
      branch: wt.branch,
      issue: wt.issue,
      priority: wt.priority,
    } satisfies WorktreeSpawnPayload;
    emit(dispatch, "worktree.spawn", spawnPayload, pipelineCorrelation);

    const spawnLog = {
      _type: "orchestrator.log",
      level: "info",
      message: `Spawned worktree: ${wt.branch}`,
    } satisfies OrchestratorLogPayload;
    emit(dispatch, "orchestrator.log", spawnLog, pipelineCorrelation);
    await delay(randomDelay());
  }

  // === Phase 5: Interleaved Steps ===
  for (let stepIdx = 0; stepIdx < STEPS.length; stepIdx++) {
    const step = STEPS[stepIdx];
    const previousStep: WorktreeStep | null = stepIdx > 0 ? STEPS[stepIdx - 1] : null;
    const logs = STEP_LOGS[step];

    // Start all worktrees on this step
    for (const wt of worktreeDefs) {
      const stepPayload = {
        _type: "worktree.step-change",
        worktreeId: wt.id,
        previousStep,
        newStep: step,
        stepStartedAt: new Date().toISOString(),
      } satisfies WorktreeStepPayload;
      emit(dispatch, "worktree.step-change", stepPayload, pipelineCorrelation);

      const statusPayload = {
        _type: "worktree.status-change",
        worktreeId: wt.id,
        previousStatus: stepIdx === 0 ? "active" as const : "active" as const,
        newStatus: "active" as const,
      } satisfies WorktreeStatusPayload;
      emit(dispatch, "worktree.status-change", statusPayload, pipelineCorrelation);
    }
    await delay(randomDelay());

    // Add logs progressively, interleaved across worktrees
    for (const log of logs) {
      for (const wt of worktreeDefs) {
        const logPayload = {
          _type: "worktree.log",
          worktreeId: wt.id,
          level: "info",
          message: `[${step}] ${log}`,
        } satisfies WorktreeLogPayload;
        emit(dispatch, "worktree.log", logPayload, pipelineCorrelation);
      }
      await delay(randomDelay());
    }

    await delay(200);
  }

  // === Phase 6: Mark all Worktrees done ===
  for (const wt of worktreeDefs) {
    const donePayload = {
      _type: "worktree.status-change",
      worktreeId: wt.id,
      previousStatus: "active",
      newStatus: "done",
    } satisfies WorktreeStatusPayload;
    emit(dispatch, "worktree.status-change", donePayload, pipelineCorrelation);
    await delay(200);
  }

  // === Phase 7: QA Gate ===
  const qaStartPayload = {
    _type: "qa.overall-status",
    previousStatus: "idle",
    newStatus: "running",
  } satisfies QAOverallStatusPayload;
  emit(dispatch, "qa.overall-status", qaStartPayload, pipelineCorrelation);
  await delay(randomDelay());

  const qaChecks: Array<{ key: QACheckName; label: string }> = [
    { key: "unitTests", label: "Unit Tests" },
    { key: "typeCheck", label: "TypeCheck" },
    { key: "lint", label: "Lint" },
    { key: "build", label: "Build" },
    { key: "e2e", label: "E2E Tests" },
  ];

  let allPassed = true;
  let previousQAOverall: "idle" | "running" = "running";

  for (const check of qaChecks) {
    // Set running
    const runningPayload = {
      _type: "qa.check-update",
      check: check.key,
      previousStatus: "pending" as QACheckStatus,
      newStatus: "running" as QACheckStatus,
    } satisfies QACheckUpdatePayload;
    emit(dispatch, "qa.check-update", runningPayload, pipelineCorrelation);
    await delay(400 + Math.random() * 400);

    // Determine result (15% failure rate)
    const passed = Math.random() > QA_CHECK_FAILURE_RATE;
    if (!passed) allPassed = false;

    const resultPayload = {
      _type: "qa.check-update",
      check: check.key,
      previousStatus: "running" as QACheckStatus,
      newStatus: (passed ? "pass" : "fail") as QACheckStatus,
      duration: Math.round(500 + Math.random() * 2000),
      details: passed
        ? `${check.label}: All checks passed`
        : `${check.label}: Failed — see output for details`,
    } satisfies QACheckUpdatePayload;
    emit(dispatch, "qa.check-update", resultPayload, pipelineCorrelation);
    await delay(randomDelay());
  }

  // QA overall result
  void previousQAOverall; // consumed by type system
  const qaFinalPayload = {
    _type: "qa.overall-status",
    previousStatus: "running",
    newStatus: allPassed ? "pass" : "fail",
  } satisfies QAOverallStatusPayload;
  emit(dispatch, "qa.overall-status", qaFinalPayload, pipelineCorrelation);
  await delay(300);

  // === Phase 8: Pipeline Stop ===
  const stopPayload = {
    _type: "pipeline.stop",
    reason: "completed",
  } satisfies PipelineStopPayload;
  emit(dispatch, "pipeline.stop", stopPayload, pipelineCorrelation);
}
