import { usePipelineStore } from "./pipelineStore";
import type {
  OrchestratorStatus,
  WorktreeStep,
  WorktreeStatus,
  QACheckStatus as StoreQACheckStatus,
  SpawnManifest,
} from "./pipelineStore";
import type {
  ADPEnvelope,
  OrchestratorStatusPayload,
  OrchestratorLogPayload,
  OrchestratorManifestPayload,
  WorktreeSpawnPayload,
  WorktreeStepPayload,
  WorktreeStatusPayload,
  WorktreeLogPayload,
  QACheckUpdatePayload,
  QAOverallStatusPayload,
  PipelineStartPayload,
  TerminalOutputPayload,
} from "../protocols/schema";
import { isIdempotent } from "../protocols/schema";

/**
 * Mappt einen ADP OrchestratorState auf den Store-kompatiblen OrchestratorStatus.
 * Der Store kennt nur "idle" | "planning" | "generated_manifest", waehrend ADP
 * zusaetzlich "executing" und "error" hat.
 */
function toStoreOrchestratorStatus(adpStatus: string): OrchestratorStatus {
  switch (adpStatus) {
    case "idle":
      return "idle";
    case "planning":
      return "planning";
    case "generated_manifest":
      return "generated_manifest";
    case "executing":
      return "generated_manifest"; // Naechstbester Mapping
    case "error":
      return "idle"; // Fallback
    default:
      return "idle";
  }
}

/**
 * Verarbeitet ein ADP-Envelope und dispatcht die entsprechenden
 * Store-Actions. Nutzt isIdempotent() fuer Duplikat-Erkennung.
 */
export function dispatchADP(envelope: ADPEnvelope): void {
  // Duplikat-Erkennung
  if (!isIdempotent(envelope)) {
    console.debug(`[ADP] Duplikat ignoriert: ${envelope.id} (${envelope.type})`);
    return;
  }

  const store = usePipelineStore.getState();

  switch (envelope.type) {
    // --- Pipeline Events ---
    case "pipeline.start": {
      const p = envelope.payload as PipelineStartPayload;
      store.reset();
      store.setIsRunning(true);
      if (p.projectPath) {
        store.setProjectPath(p.projectPath);
      }
      break;
    }

    case "pipeline.stop": {
      store.setIsRunning(false);
      break;
    }

    case "pipeline.status":
    case "pipeline.error":
      // Informational — kein direktes Store-Mapping noetig
      break;

    // --- Orchestrator Events ---
    case "orchestrator.status-change": {
      const p = envelope.payload as OrchestratorStatusPayload;
      const mappedStatus = toStoreOrchestratorStatus(p.newStatus);
      store.setOrchestratorStatus(mappedStatus);
      break;
    }

    case "orchestrator.log": {
      const p = envelope.payload as OrchestratorLogPayload;
      store.addOrchestratorLog(p.message);
      break;
    }

    case "orchestrator.manifest-generated": {
      const p = envelope.payload as OrchestratorManifestPayload;
      store.setOrchestratorStatus("generated_manifest");
      store.addOrchestratorLog(
        `Manifest generiert — ${p.worktrees.length} Worktrees`,
      );
      const manifest: SpawnManifest = {
        generatedAt: Date.now(),
        entries: p.worktrees.map((wt) => ({
          id: wt.id,
          branch: wt.branch,
          issue: wt.issue,
          priority: wt.priority,
        })),
      };
      store.setManifest(manifest);
      break;
    }

    // --- Worktree Events ---
    case "worktree.spawn": {
      const p = envelope.payload as WorktreeSpawnPayload;
      store.spawnWorktree(p.worktreeId, p.branch, p.issue, p.priority);
      break;
    }

    case "worktree.step-change": {
      const p = envelope.payload as WorktreeStepPayload;
      store.updateWorktreeStep(p.worktreeId, p.newStep as WorktreeStep);
      break;
    }

    case "worktree.status-change": {
      const p = envelope.payload as WorktreeStatusPayload;
      store.updateWorktreeStatus(p.worktreeId, p.newStatus as WorktreeStatus, p.reason);
      break;
    }

    case "worktree.log": {
      const p = envelope.payload as WorktreeLogPayload;
      store.addWorktreeLog(p.worktreeId, p.message);
      break;
    }

    case "worktree.progress":
      // Progress wird im Store ueber updateWorktreeStep berechnet,
      // daher kein separates Handling noetig.
      break;

    // --- QA Gate Events ---
    case "qa.check-update": {
      const p = envelope.payload as QACheckUpdatePayload;
      // ADP kennt "skipped", der Store nicht — "skipped" auf "pending" mappen
      const mappedStatus: StoreQACheckStatus =
        p.newStatus === "skipped" ? "pending" : (p.newStatus as StoreQACheckStatus);
      store.updateQACheck(p.check, mappedStatus);
      break;
    }

    case "qa.overall-status": {
      const p = envelope.payload as QAOverallStatusPayload;
      store.setQAOverallStatus(p.newStatus);
      break;
    }

    case "qa.report":
      // Report ist informational — einzelne Checks kommen via qa.check-update
      break;

    // --- Terminal Events ---
    case "terminal.output": {
      const p = envelope.payload as TerminalOutputPayload;
      store.addRawLog(p.data);
      break;
    }

    case "terminal.spawn":
    case "terminal.input":
    case "terminal.exit":
      // Terminal-Lifecycle Events — aktuell kein Store-Mapping
      break;

    default:
      console.warn(`[ADP] Unbekannter Event-Typ: ${envelope.type}`);
      break;
  }
}
