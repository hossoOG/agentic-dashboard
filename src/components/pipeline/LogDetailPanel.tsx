import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ArrowDownToLine, Search } from "lucide-react";
import type { WorktreeStatus, WorktreeStep } from "../../store/pipelineStore";

const STEP_LABELS: Record<WorktreeStep, string> = {
  setup: "Setup",
  plan: "Plan",
  validate: "Validate",
  code: "Code",
  review: "Review",
  self_verify: "Self-Verify",
  draft_pr: "Draft PR",
};

const ALL_STEPS: WorktreeStep[] = [
  "setup", "plan", "validate", "code", "review", "self_verify", "draft_pr",
];

const STATUS_DOT: Record<WorktreeStatus, string> = {
  idle: "bg-gray-500",
  active: "bg-neon-blue",
  blocked: "bg-red-500",
  waiting_for_input: "bg-neon-orange",
  done: "bg-neon-green",
  error: "bg-red-500",
};

/** Colorize log lines based on content */
function colorizeLog(line: string): string {
  if (/error|fail|fatal|panic/i.test(line)) return "text-red-400";
  if (/success|pass|done|complete|merged/i.test(line)) return "text-neon-green";
  if (/warn/i.test(line)) return "text-yellow-400";
  return "text-gray-400";
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  worktreeId: string;
  logs: string[];
  currentStep: WorktreeStep;
  status: WorktreeStatus;
}

export function LogDetailPanel({ isOpen, onClose, worktreeId, logs, currentStep, status }: Props) {
  const [autoScroll, setAutoScroll] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [stepFilter, setStepFilter] = useState<WorktreeStep | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (autoScroll && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs.length, autoScroll]);

  // ESC key to close
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKey);
      return () => window.removeEventListener("keydown", handleKey);
    }
  }, [isOpen, onClose]);

  // Detect manual scroll to disable auto-scroll
  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setAutoScroll(atBottom);
  }, []);

  // Filter logs
  const filteredLogs = logs.filter((line) => {
    if (searchQuery && !line.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (stepFilter && !line.includes(`[${stepFilter}]`)) return false;
    return true;
  });

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/50 z-40"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed right-0 top-0 bottom-0 w-[40%] min-w-[400px] z-50 flex flex-col bg-dark-card border-l-2 border-neon-blue/40"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-dark-border">
              <div className="flex items-center gap-3">
                <div className={`w-2.5 h-2.5 rounded-full ${STATUS_DOT[status]}`} />
                <span className="text-sm font-bold tracking-widest text-gray-200">
                  {worktreeId}
                </span>
                <span className="text-xs text-gray-500 font-mono">
                  / {STEP_LABELS[currentStep]}
                </span>
              </div>
              <button
                onClick={onClose}
                className="p-1 text-gray-500 hover:text-gray-300 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search + Step filter */}
            <div className="px-4 py-2 border-b border-dark-border space-y-2">
              {/* Search input */}
              <div className="flex items-center gap-2 px-2 py-1.5 bg-dark-bg border border-dark-border">
                <Search className="w-3.5 h-3.5 text-gray-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Log durchsuchen..."
                  className="flex-1 bg-transparent text-xs text-gray-300 placeholder-gray-600 outline-none font-mono"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery("")} className="text-gray-500 hover:text-gray-300">
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* Step filter buttons */}
              <div className="flex flex-wrap gap-1">
                <button
                  onClick={() => setStepFilter(null)}
                  className={`px-2 py-0.5 text-xs font-mono border transition-colors ${
                    stepFilter === null
                      ? "border-neon-blue text-neon-blue bg-neon-blue/10"
                      : "border-dark-border text-gray-500 hover:text-gray-300"
                  }`}
                >
                  Alle
                </button>
                {ALL_STEPS.map((step) => (
                  <button
                    key={step}
                    onClick={() => setStepFilter(stepFilter === step ? null : step)}
                    className={`px-2 py-0.5 text-xs font-mono border transition-colors ${
                      stepFilter === step
                        ? "border-neon-blue text-neon-blue bg-neon-blue/10"
                        : "border-dark-border text-gray-500 hover:text-gray-300"
                    }`}
                  >
                    {STEP_LABELS[step]}
                  </button>
                ))}
              </div>
            </div>

            {/* Log content */}
            <div
              ref={scrollContainerRef}
              onScroll={handleScroll}
              className="flex-1 overflow-y-auto px-4 py-2 retro-terminal"
            >
              {filteredLogs.map((line, i) => (
                <div key={i} className={`text-xs leading-relaxed py-0.5 font-mono ${colorizeLog(line)}`}>
                  <span className="text-gray-600 select-none mr-2">
                    {String(i + 1).padStart(3, " ")}
                  </span>
                  <span className="text-gray-600 mr-1">{">"}</span>
                  {line}
                </div>
              ))}
              {filteredLogs.length === 0 && (
                <div className="text-gray-600 text-xs italic py-4 text-center">
                  {searchQuery || stepFilter ? "Keine Treffer" : "Noch keine Logs..."}
                </div>
              )}
              <div ref={logEndRef} />
            </div>

            {/* Footer: Auto-scroll toggle + count */}
            <div className="flex items-center justify-between px-4 py-2 border-t border-dark-border text-xs text-gray-500">
              <span className="font-mono">{filteredLogs.length} Zeilen</span>
              <button
                onClick={() => {
                  setAutoScroll(!autoScroll);
                  if (!autoScroll) {
                    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
                  }
                }}
                className={`flex items-center gap-1 px-2 py-1 border transition-colors ${
                  autoScroll
                    ? "border-neon-green text-neon-green"
                    : "border-dark-border text-gray-500 hover:text-gray-300"
                }`}
              >
                <ArrowDownToLine className="w-3 h-3" />
                Auto-Scroll
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
