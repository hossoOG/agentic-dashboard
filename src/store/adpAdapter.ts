import { usePipelineStore } from "./pipelineStore";
import type { ParsedEvent } from "./logParser";
import type {
  ADPEnvelope,
  ADPPayload,
  ADPSource,
  OrchestratorState,
  OrchestratorStatusPayload,
  OrchestratorLogPayload,
  WorktreeSpawnPayload,
  WorktreeStepPayload,
  WorktreeStatusPayload,
  WorktreeLogPayload,
  QACheckUpdatePayload,
  QAOverallStatusPayload,
  WorktreeStep,
  WorktreeStatus,
  QACheckName,
  QACheckStatus,
  QAOverallStatus,
} from "../protocols/schema";
import { createADPMessage } from "../protocols/schema";

/**
 * Feature-Flag: Wenn true, werden ParsedEvents ueber den ADP-Pfad
 * (legacyToADP -> dispatchADP) verarbeitet statt ueber applyParsedEvents.
 */
export const USE_ADP_PIPELINE = false;

const ADAPTER_SOURCE: ADPSource = { kind: "react-frontend" };

/**
 * Mappt einen OrchestratorStatus-String aus dem Legacy-Parser auf den
 * ADP-kompatiblen OrchestratorState-Typ.
 */
function mapOrchestratorStatus(status: string): OrchestratorState {
  switch (status) {
    case "idle":
      return "idle";
    case "planning":
      return "planning";
    case "generated_manifest":
      return "generated_manifest";
    default:
      return "idle";
  }
}

/**
 * Liest den vorherigen OrchestratorStatus aus dem Store und mappt ihn
 * auf den ADP OrchestratorState.
 */
function getPreviousOrchestratorStatus(): OrchestratorState {
  const state = usePipelineStore.getState();
  return mapOrchestratorStatus(state.orchestratorStatus);
}

/**
 * Liest den vorherigen Step eines Worktrees aus dem Store.
 */
function getPreviousWorktreeStep(worktreeId: string): WorktreeStep | null {
  const state = usePipelineStore.getState();
  const wt = state.worktrees.find((w) => w.id === worktreeId);
  return wt?.currentStep ?? null;
}

/**
 * Liest den vorherigen Status eines Worktrees aus dem Store.
 */
function getPreviousWorktreeStatus(worktreeId: string): WorktreeStatus {
  const state = usePipelineStore.getState();
  const wt = state.worktrees.find((w) => w.id === worktreeId);
  return wt?.status ?? "idle";
}

/**
 * Liest den vorherigen QA-Check-Status aus dem Store.
 */
function getPreviousQACheckStatus(check: QACheckName): QACheckStatus {
  const state = usePipelineStore.getState();
  return state.qaGate[check] as QACheckStatus;
}

/**
 * Liest den vorherigen QA-Overall-Status aus dem Store.
 */
function getPreviousQAOverallStatus(): QAOverallStatus {
  const state = usePipelineStore.getState();
  return state.qaGate.overallStatus;
}

/**
 * Konvertiert ein Legacy-ParsedEvent aus dem logParser in ein ADP-Envelope.
 * Gibt null zurueck wenn das Event nicht sinnvoll gemappt werden kann.
 */
export function legacyToADP(event: ParsedEvent): ADPEnvelope | null {
  switch (event.type) {
    case "orchestrator_status": {
      const newStatus = mapOrchestratorStatus(event.payload.status);
      const previousStatus = getPreviousOrchestratorStatus();
      const payload: OrchestratorStatusPayload = {
        _type: "orchestrator.status-change",
        previousStatus,
        newStatus,
      };
      return createADPMessage<ADPPayload>(
        "orchestrator.status-change",
        ADAPTER_SOURCE,
        payload,
      );
    }

    case "orchestrator_log": {
      const payload: OrchestratorLogPayload = {
        _type: "orchestrator.log",
        level: "info",
        message: event.payload.log,
      };
      return createADPMessage<ADPPayload>(
        "orchestrator.log",
        ADAPTER_SOURCE,
        payload,
      );
    }

    case "worktree_spawn": {
      const payload: WorktreeSpawnPayload = {
        _type: "worktree.spawn",
        worktreeId: event.payload.id,
        branch: event.payload.branch,
        issue: event.payload.issue,
        priority: 1,
      };
      return createADPMessage<ADPPayload>(
        "worktree.spawn",
        ADAPTER_SOURCE,
        payload,
      );
    }

    case "worktree_step": {
      const worktreeId = event.payload.id;
      const newStep = event.payload.step as WorktreeStep;
      const previousStep = getPreviousWorktreeStep(worktreeId);
      const payload: WorktreeStepPayload = {
        _type: "worktree.step-change",
        worktreeId,
        previousStep,
        newStep,
        stepStartedAt: new Date().toISOString(),
      };
      return createADPMessage<ADPPayload>(
        "worktree.step-change",
        ADAPTER_SOURCE,
        payload,
      );
    }

    case "worktree_status": {
      const worktreeId = event.payload.id;
      const newStatus = event.payload.status as WorktreeStatus;
      const previousStatus = getPreviousWorktreeStatus(worktreeId);
      const payload: WorktreeStatusPayload = {
        _type: "worktree.status-change",
        worktreeId,
        previousStatus,
        newStatus,
      };
      return createADPMessage<ADPPayload>(
        "worktree.status-change",
        ADAPTER_SOURCE,
        payload,
      );
    }

    case "worktree_log": {
      const payload: WorktreeLogPayload = {
        _type: "worktree.log",
        worktreeId: event.payload.id,
        level: "info",
        message: event.payload.log,
      };
      return createADPMessage<ADPPayload>(
        "worktree.log",
        ADAPTER_SOURCE,
        payload,
      );
    }

    case "qa_check": {
      if (event.payload.check === "overallStatus") {
        const newStatus = event.payload.status as QAOverallStatus;
        const previousStatus = getPreviousQAOverallStatus();
        const payload: QAOverallStatusPayload = {
          _type: "qa.overall-status",
          previousStatus,
          newStatus,
        };
        return createADPMessage<ADPPayload>(
          "qa.overall-status",
          ADAPTER_SOURCE,
          payload,
        );
      } else {
        const check = event.payload.check as QACheckName;
        const newStatus = event.payload.status as QACheckStatus;
        const previousStatus = getPreviousQACheckStatus(check);
        const payload: QACheckUpdatePayload = {
          _type: "qa.check-update",
          check,
          previousStatus,
          newStatus,
        };
        return createADPMessage<ADPPayload>(
          "qa.check-update",
          ADAPTER_SOURCE,
          payload,
        );
      }
    }

    case "raw_log": {
      // Raw logs werden als terminal.output gemappt
      const payload = {
        _type: "terminal.output" as const,
        terminalId: "pipeline-stdout",
        stream: "stdout" as const,
        data: event.payload.line,
      };
      return createADPMessage<ADPPayload>(
        "terminal.output",
        ADAPTER_SOURCE,
        payload,
      );
    }

    default:
      return null;
  }
}
