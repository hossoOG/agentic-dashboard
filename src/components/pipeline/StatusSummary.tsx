import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Activity, CheckCircle2, AlertTriangle, Clock, Coins, Cpu } from "lucide-react";
import { usePipelineStore, selectPipelineSummary } from "../../store/pipelineStore";

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return hours > 0
    ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(minutes)}:${pad(seconds)}`;
}

function formatTokens(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}k`;
  return String(count);
}

export function StatusSummary() {
  const summary = usePipelineStore(selectPipelineSummary);
  const isRunning = usePipelineStore((s) => s.isRunning);
  const pipelineStartedAt = usePipelineStore((s) => s.pipelineStartedAt);
  const pipelineStoppedAt = usePipelineStore((s) => s.pipelineStoppedAt);
  const totalTokenUsage = usePipelineStore((s) => s.totalTokenUsage);

  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!pipelineStartedAt) {
      setElapsed(0);
      return;
    }

    if (!isRunning && pipelineStoppedAt) {
      setElapsed(pipelineStoppedAt - pipelineStartedAt);
      return;
    }

    const tick = () => setElapsed(Date.now() - pipelineStartedAt);
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [isRunning, pipelineStartedAt, pipelineStoppedAt]);

  const items = [
    {
      icon: Activity,
      label: "Aktiv",
      value: summary.activeCount,
      color: "text-accent",
    },
    {
      icon: CheckCircle2,
      label: "Fertig",
      value: summary.doneCount,
      color: "text-neon-green",
    },
    {
      icon: AlertTriangle,
      label: "Fehler",
      value: summary.errorCount,
      color: summary.errorCount > 0 ? "text-error" : "text-neutral-500",
    },
    {
      icon: Clock,
      label: "Laufzeit",
      value: formatDuration(elapsed),
      color: isRunning ? "text-accent" : "text-neutral-400",
      isText: true,
    },
    {
      icon: Cpu,
      label: "Tokens",
      value: formatTokens(totalTokenUsage.inputTokens + totalTokenUsage.outputTokens),
      color: "text-neon-purple",
      isText: true,
    },
    {
      icon: Coins,
      label: "Kosten",
      value: `$${totalTokenUsage.totalCostUsd.toFixed(2)}`,
      color: "text-neon-orange",
      isText: true,
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="flex items-center justify-center gap-6 px-6 py-2 bg-surface-raised border-b border-neutral-700"
    >
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <div key={item.label} className="flex items-center gap-2">
            <Icon className={`w-4 h-4 ${item.color}`} />
            <span className="text-xs text-neutral-500 tracking-wide">{item.label}</span>
            <span className={`text-sm font-bold font-mono ${item.color}`}>
              {item.value}
            </span>
          </div>
        );
      })}

      {/* Running indicator */}
      {isRunning && (
        <motion.div
          className="w-2 h-2 rounded-full bg-neon-green"
          animate={{ opacity: [1, 0.2, 1] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
      )}
    </motion.div>
  );
}
