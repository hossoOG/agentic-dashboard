import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Play, Square, ChevronDown, Loader2, AlertCircle } from "lucide-react";
import {
  usePipelineStatusStore,
  selectIsRunning,
  selectIsIdle,
} from "../../store/pipelineStatusStore";
import { getErrorMessage } from "../../utils/adpError";
import { logError } from "../../utils/errorLogger";
import { Button } from "../ui";
import type { WorkflowSummary } from "../../types/workflow";
import type { WorkflowDefinition, WorkflowInput } from "../../types/workflow";

// ============================================================================
// Props
// ============================================================================

export interface PipelineControlsProps {
  /** Absolute path to the project folder. */
  projectPath: string;
}

// ============================================================================
// Component
// ============================================================================

export function PipelineControls({ projectPath }: PipelineControlsProps) {
  const isRunning = usePipelineStatusStore(selectIsRunning);
  const isIdle = usePipelineStatusStore(selectIsIdle);

  // Workflow list
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  // Selected workflow + its full definition (for inputs)
  const [selectedPath, setSelectedPath] = useState<string>("");
  const [workflowDef, setWorkflowDef] = useState<WorkflowDefinition | null>(null);
  const [loadingDef, setLoadingDef] = useState(false);

  // Input values
  const [inputValues, setInputValues] = useState<Record<string, string>>({});

  // Action state
  const [actionError, setActionError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);

  // ── Load workflow list ──────────────────────────────────────────────
  const loadWorkflows = useCallback(async () => {
    if (!projectPath) return;
    setLoadingList(true);
    setListError(null);
    try {
      const list = await invoke<WorkflowSummary[]>("list_workflows", {
        projectPath,
      });
      setWorkflows(list);
      // Auto-select first if nothing selected
      if (list.length > 0) {
        setSelectedPath((prev) => prev || list[0].file_path);
      }
    } catch (err) {
      setListError(getErrorMessage(err));
      logError("PipelineControls.loadWorkflows", err);
    } finally {
      setLoadingList(false);
    }
  }, [projectPath]);

  useEffect(() => {
    loadWorkflows();
  }, [loadWorkflows]);

  // ── Load workflow definition when selection changes ──────────────────
  useEffect(() => {
    if (!selectedPath) {
      setWorkflowDef(null);
      setInputValues({});
      return;
    }

    let cancelled = false;
    setLoadingDef(true);

    invoke<WorkflowDefinition>("load_workflow", { path: selectedPath })
      .then((def) => {
        if (cancelled) return;
        setWorkflowDef(def);
        // Initialize input values with defaults
        const defaults: Record<string, string> = {};
        for (const input of def.inputs) {
          if (input.default != null) {
            defaults[input.name] = String(input.default);
          } else if (input.type === "boolean") {
            defaults[input.name] = "false";
          } else {
            defaults[input.name] = "";
          }
        }
        setInputValues(defaults);
      })
      .catch((err) => {
        if (cancelled) return;
        logError("PipelineControls.loadWorkflow", err);
        setWorkflowDef(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingDef(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedPath]);

  // ── Handlers ────────────────────────────────────────────────────────
  const handleInputChange = useCallback((name: string, value: string) => {
    setInputValues((prev) => ({ ...prev, [name]: value }));
  }, []);

  const handleStart = useCallback(async () => {
    if (!selectedPath || !projectPath) return;

    // Validate required fields
    if (workflowDef) {
      for (const input of workflowDef.inputs) {
        if (input.required && !inputValues[input.name]?.trim()) {
          setActionError(`Pflichtfeld "${input.name}" ist leer`);
          return;
        }
      }
    }

    setStarting(true);
    setActionError(null);
    try {
      await invoke("run_workflow", {
        workflowPath: selectedPath,
        inputs: inputValues,
        projectPath,
      });
    } catch (err) {
      setActionError(getErrorMessage(err));
      logError("PipelineControls.runWorkflow", err);
    } finally {
      setStarting(false);
    }
  }, [selectedPath, projectPath, inputValues, workflowDef]);

  const handleStop = useCallback(async () => {
    setStopping(true);
    setActionError(null);
    try {
      await invoke("stop_pipeline");
    } catch (err) {
      setActionError(getErrorMessage(err));
      logError("PipelineControls.stopPipeline", err);
    } finally {
      setStopping(false);
    }
  }, []);

  // ── Render ──────────────────────────────────────────────────────────
  return (
    <div className="border-b border-neutral-700 px-4 py-3">
      <div className="flex flex-col gap-3">
        {/* Row 1: Workflow picker + action buttons */}
        <div className="flex items-end gap-3">
          {/* Workflow selector */}
          <div className="flex-1 min-w-0">
            <label className="block text-[10px] text-neutral-500 uppercase tracking-wider mb-1">
              Workflow auswaehlen
            </label>
            <div className="relative">
              <select
                value={selectedPath}
                onChange={(e) => setSelectedPath(e.target.value)}
                disabled={isRunning || loadingList}
                className="w-full appearance-none bg-surface-raised border border-neutral-700 text-sm text-neutral-300 rounded px-3 py-1.5 pr-8 focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {workflows.length === 0 && (
                  <option value="">
                    {loadingList
                      ? "Workflows werden geladen..."
                      : "Keine Workflows gefunden"}
                  </option>
                )}
                {workflows.map((wf) => (
                  <option key={wf.file_path} value={wf.file_path}>
                    {wf.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-500 pointer-events-none" />
            </div>
          </div>

          {/* Start button */}
          <Button
            variant="primary"
            size="sm"
            icon={<Play className="w-3 h-3" />}
            loading={starting}
            disabled={!isIdle || !selectedPath || starting}
            onClick={handleStart}
          >
            Pipeline starten
          </Button>

          {/* Stop button */}
          <Button
            variant="danger"
            size="sm"
            icon={<Square className="w-3 h-3" />}
            loading={stopping}
            disabled={!isRunning || stopping}
            onClick={handleStop}
          >
            Pipeline stoppen
          </Button>
        </div>

        {/* Row 2: Dynamic input fields */}
        {workflowDef && workflowDef.inputs.length > 0 && !isRunning && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {workflowDef.inputs.map((input) => (
              <InputField
                key={input.name}
                input={input}
                value={inputValues[input.name] ?? ""}
                onChange={handleInputChange}
              />
            ))}
          </div>
        )}

        {/* Loading definition */}
        {loadingDef && (
          <div className="flex items-center gap-2 text-neutral-500 text-xs">
            <Loader2 className="w-3 h-3 animate-spin" />
            Workflow wird geladen...
          </div>
        )}

        {/* List error */}
        {listError && (
          <div className="flex items-center gap-2 text-red-400 text-xs">
            <AlertCircle className="w-3 h-3 shrink-0" />
            {listError}
          </div>
        )}

        {/* Action error */}
        {actionError && (
          <div className="flex items-center gap-2 text-red-400 text-xs">
            <AlertCircle className="w-3 h-3 shrink-0" />
            {actionError}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// InputField — renders a single workflow input
// ============================================================================

function InputField({
  input,
  value,
  onChange,
}: {
  input: WorkflowInput;
  value: string;
  onChange: (name: string, value: string) => void;
}) {
  const label = (
    <label className="block text-[10px] text-neutral-500 uppercase tracking-wider mb-1">
      {input.name}
      {input.required && <span className="text-red-400 ml-0.5">*</span>}
    </label>
  );

  const baseInputClass =
    "w-full bg-surface-raised border border-neutral-700 text-sm text-neutral-300 rounded px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent";

  if (input.type === "boolean") {
    return (
      <div>
        <label className="flex items-center gap-2 text-xs text-neutral-300 cursor-pointer">
          <input
            type="checkbox"
            checked={value === "true"}
            onChange={(e) =>
              onChange(input.name, e.target.checked ? "true" : "false")
            }
            className="rounded border-neutral-600 bg-surface-raised text-accent focus:ring-accent"
          />
          {input.name}
          {input.required && <span className="text-red-400">*</span>}
        </label>
        {input.description && (
          <span className="text-[10px] text-neutral-600 mt-0.5 block">
            {input.description}
          </span>
        )}
      </div>
    );
  }

  if (input.type === "select" && input.options.length > 0) {
    return (
      <div>
        {label}
        <select
          value={value}
          onChange={(e) => onChange(input.name, e.target.value)}
          className={baseInputClass}
          title={input.description ?? undefined}
        >
          <option value="">-- Bitte waehlen --</option>
          {input.options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (input.type === "number") {
    return (
      <div>
        {label}
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(input.name, e.target.value)}
          placeholder={input.description ?? undefined}
          className={baseInputClass}
        />
      </div>
    );
  }

  // Default: string input
  return (
    <div>
      {label}
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(input.name, e.target.value)}
        placeholder={input.description ?? undefined}
        className={baseInputClass}
      />
    </div>
  );
}
