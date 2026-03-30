import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-shell";
import {
  X,
  ExternalLink,
  MessageSquare,
  User,
  Calendar,
  Tag,
  RefreshCw,
  GitPullRequest,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
} from "lucide-react";
import type { KanbanLabel } from "./KanbanCard";

// ============================================================================
// Types (matches Rust IssueDetail)
// ============================================================================

interface IssueComment {
  author: string;
  body: string;
  created_at: string;
}

interface CheckRun {
  name: string;
  status: string;
  conclusion: string;
}

interface LinkedPR {
  number: number;
  title: string;
  state: string;
  url: string;
  checks: CheckRun[];
}

interface IssueDetail {
  number: number;
  title: string;
  body: string;
  state: string;
  author: string;
  created_at: string;
  closed_at: string;
  labels: KanbanLabel[];
  assignee: string;
  url: string;
  comments: IssueComment[];
}

// ============================================================================
// Props
// ============================================================================

interface KanbanDetailModalProps {
  folder: string;
  issueNumber: number;
  onClose: () => void;
}

// ============================================================================
// Helpers
// ============================================================================

function formatDate(iso: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function labelStyle(color: string): React.CSSProperties {
  const hex = color.startsWith("#") ? color : `#${color}`;
  return {
    backgroundColor: `${hex}20`,
    color: hex,
    borderColor: `${hex}40`,
  };
}

// ============================================================================
// Component
// ============================================================================

export function KanbanDetailModal({
  folder,
  issueNumber,
  onClose,
}: KanbanDetailModalProps) {
  const [detail, setDetail] = useState<IssueDetail | null>(null);
  const [linkedPRs, setLinkedPRs] = useState<LinkedPR[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const [issueResult, checksResult] = await Promise.all([
          invoke<IssueDetail>("get_issue_detail", { folder, number: issueNumber }),
          invoke<LinkedPR[]>("get_issue_checks", { folder, number: issueNumber }).catch(() => [] as LinkedPR[]),
        ]);
        if (!cancelled) {
          setDetail(issueResult);
          setLinkedPRs(checksResult);
        }
      } catch (err) {
        if (!cancelled) setError(String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [folder, issueNumber]);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-surface-base border border-neutral-700 rounded-md w-[640px] max-w-[90vw] max-h-[80vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-700 shrink-0">
          <span className="text-sm font-medium text-neutral-200">
            #{issueNumber}
          </span>
          <div className="flex items-center gap-1">
            {detail?.url && (
              <button
                onClick={() => open(detail.url)}
                className="p-1.5 text-neutral-500 hover:text-neutral-200 transition-colors"
                title="Im Browser oeffnen"
              >
                <ExternalLink className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 text-neutral-500 hover:text-neutral-200 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-neutral-500 text-sm">
              <RefreshCw className="w-4 h-4 animate-spin mr-2" />
              Laden...
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-12 text-red-400 text-sm">
              {error}
            </div>
          ) : detail ? (
            <div className="p-4 space-y-4">
              {/* Title */}
              <h2 className="text-base font-semibold text-neutral-100 leading-snug">
                {detail.title}
              </h2>

              {/* Meta row */}
              <div className="flex items-center gap-4 text-xs text-neutral-500 flex-wrap">
                <span
                  className={`px-2 py-0.5 rounded-sm text-[11px] font-medium ${
                    detail.state === "CLOSED"
                      ? "bg-purple-500/20 text-purple-300"
                      : "bg-green-500/20 text-green-300"
                  }`}
                >
                  {detail.state === "CLOSED" ? "Geschlossen" : "Offen"}
                </span>
                {detail.author && (
                  <span className="flex items-center gap-1">
                    <User className="w-3 h-3" />
                    {detail.author}
                  </span>
                )}
                {detail.created_at && (
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {formatDate(detail.created_at)}
                  </span>
                )}
                {detail.assignee && (
                  <span className="text-neutral-400">
                    Zugewiesen: {detail.assignee}
                  </span>
                )}
              </div>

              {/* Labels */}
              {detail.labels.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Tag className="w-3 h-3 text-neutral-500 shrink-0" />
                  {detail.labels.map((label) => (
                    <span
                      key={label.name}
                      className="text-[10px] px-1.5 py-0.5 rounded-sm border font-medium"
                      style={labelStyle(label.color)}
                    >
                      {label.name}
                    </span>
                  ))}
                </div>
              )}

              {/* Linked PRs & CI Checks */}
              {linkedPRs.length > 0 && (
                <div className="border-t border-neutral-700/50 pt-3 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs text-neutral-400 font-medium">
                    <GitPullRequest className="w-3.5 h-3.5" />
                    Verknuepfte Pull Requests
                  </div>
                  {linkedPRs.map((pr) => (
                    <div
                      key={pr.number}
                      className="bg-surface-raised border border-neutral-700/50 rounded-sm p-3"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <button
                          onClick={() => open(pr.url)}
                          className="text-xs font-medium text-neutral-200 hover:text-accent transition-colors text-left"
                        >
                          #{pr.number} {pr.title}
                        </button>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded-sm font-medium ${
                            pr.state === "MERGED"
                              ? "bg-purple-500/20 text-purple-300"
                              : pr.state === "CLOSED"
                                ? "bg-red-500/20 text-red-300"
                                : "bg-green-500/20 text-green-300"
                          }`}
                        >
                          {pr.state === "MERGED" ? "Merged" : pr.state === "CLOSED" ? "Closed" : "Open"}
                        </span>
                      </div>
                      {pr.checks.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {pr.checks.map((check, i) => {
                            const isSuccess =
                              check.conclusion === "SUCCESS" || check.conclusion === "success";
                            const isFailed =
                              check.conclusion === "FAILURE" ||
                              check.conclusion === "failure" ||
                              check.conclusion === "ERROR" ||
                              check.conclusion === "error";
                            const isPending =
                              check.status === "IN_PROGRESS" ||
                              check.status === "QUEUED" ||
                              check.status === "PENDING" ||
                              check.status === "pending";
                            return (
                              <span
                                key={i}
                                className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-sm border font-medium ${
                                  isSuccess
                                    ? "bg-green-500/10 text-green-400 border-green-500/20"
                                    : isFailed
                                      ? "bg-red-500/10 text-red-400 border-red-500/20"
                                      : isPending
                                        ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/20"
                                        : "bg-neutral-500/10 text-neutral-400 border-neutral-700/50"
                                }`}
                              >
                                {isSuccess ? (
                                  <CheckCircle2 className="w-2.5 h-2.5" />
                                ) : isFailed ? (
                                  <XCircle className="w-2.5 h-2.5" />
                                ) : isPending ? (
                                  <Loader2 className="w-2.5 h-2.5 animate-spin" />
                                ) : (
                                  <Clock className="w-2.5 h-2.5" />
                                )}
                                {check.name}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Body */}
              {detail.body && (
                <div className="border-t border-neutral-700/50 pt-3">
                  <pre className="text-xs text-neutral-300 whitespace-pre-wrap font-sans leading-relaxed">
                    {detail.body}
                  </pre>
                </div>
              )}

              {/* Comments */}
              {detail.comments.length > 0 && (
                <div className="border-t border-neutral-700/50 pt-3 space-y-3">
                  <div className="flex items-center gap-1.5 text-xs text-neutral-400 font-medium">
                    <MessageSquare className="w-3.5 h-3.5" />
                    {detail.comments.length}{" "}
                    {detail.comments.length === 1 ? "Kommentar" : "Kommentare"}
                  </div>
                  {detail.comments.map((comment, i) => (
                    <div
                      key={i}
                      className="bg-surface-raised border border-neutral-700/50 rounded-sm p-3"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-neutral-300">
                          {comment.author}
                        </span>
                        <span className="text-[10px] text-neutral-600">
                          {formatDate(comment.created_at)}
                        </span>
                      </div>
                      <pre className="text-xs text-neutral-400 whitespace-pre-wrap font-sans leading-relaxed">
                        {comment.body}
                      </pre>
                    </div>
                  ))}
                </div>
              )}

              {/* Closed at */}
              {detail.closed_at && (
                <div className="text-[11px] text-neutral-600 pt-2 border-t border-neutral-700/50">
                  Geschlossen am {formatDate(detail.closed_at)}
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
