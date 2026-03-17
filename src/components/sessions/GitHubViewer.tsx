import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  RefreshCw,
  GitBranch,
  GitCommit,
  GitPullRequest,
  CircleDot,
  ExternalLink,
  Github,
} from "lucide-react";

interface GitHubViewerProps {
  folder: string;
}

interface GitCommitInfo {
  hash: string;
  message: string;
  date: string;
}

interface GitInfo {
  branch: string;
  last_commit: GitCommitInfo | null;
  remote_url: string;
}

interface GithubPR {
  number: number;
  title: string;
  author: string;
  status: string;
  url: string;
}

interface GithubIssue {
  number: number;
  title: string;
  labels: string[];
  assignee: string;
  url: string;
}

function statusColor(status: string): string {
  switch (status) {
    case "APPROVED":
      return "text-success";
    case "CHANGES_REQUESTED":
      return "text-red-400";
    default:
      return "text-yellow-400";
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case "APPROVED":
      return "Approved";
    case "CHANGES_REQUESTED":
      return "Changes";
    case "REVIEW_REQUIRED":
      return "Review";
    default:
      return "Pending";
  }
}

export function GitHubViewer({ folder }: GitHubViewerProps) {
  const [gitInfo, setGitInfo] = useState<GitInfo | null>(null);
  const [prs, setPrs] = useState<GithubPR[]>([]);
  const [issues, setIssues] = useState<GithubIssue[]>([]);
  const [gitError, setGitError] = useState<string>("");
  const [ghError, setGhError] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    setGitError("");
    setGhError("");

    // Git info (always works if git repo)
    try {
      const info = await invoke<GitInfo>("get_git_info", { folder });
      setGitInfo(info);
    } catch (err) {
      setGitInfo(null);
      setGitError(String(err));
    }

    // GitHub PRs + Issues (needs gh CLI)
    try {
      const [prResult, issueResult] = await Promise.all([
        invoke<GithubPR[]>("get_github_prs", { folder }),
        invoke<GithubIssue[]>("get_github_issues", { folder }),
      ]);
      setPrs(prResult);
      setIssues(issueResult);
    } catch (err) {
      setPrs([]);
      setIssues([]);
      setGhError(String(err));
    }

    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [folder]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-neutral-500 text-sm">
        Lade Git/GitHub-Daten...
      </div>
    );
  }

  if (gitError) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-neutral-500">
        <Github className="w-10 h-10 text-neutral-600" />
        <span className="text-sm">Kein Git-Repository</span>
        <span className="text-xs text-neutral-600">{folder}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-700 shrink-0">
        <span className="text-xs text-neutral-400 font-medium">GitHub</span>
        <button
          onClick={load}
          className="p-1 text-neutral-500 hover:text-neutral-300 transition-colors"
          title="Neu laden"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-5">
        {/* Git Info */}
        {gitInfo && (
          <div className="space-y-2">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5 text-sm">
                <GitBranch className="w-4 h-4 text-accent" />
                <span className="text-accent font-bold">{gitInfo.branch}</span>
              </div>
              {gitInfo.last_commit && (
                <div className="flex items-center gap-1.5 text-xs text-neutral-400">
                  <GitCommit className="w-3.5 h-3.5" />
                  <span className="font-mono text-neutral-500">{gitInfo.last_commit.hash}</span>
                  <span className="truncate max-w-[300px]">{gitInfo.last_commit.message}</span>
                </div>
              )}
            </div>
            {gitInfo.remote_url && (
              <div className="text-xs text-neutral-600 truncate">{gitInfo.remote_url}</div>
            )}
          </div>
        )}

        {/* gh CLI error */}
        {ghError && (
          <div className="bg-surface-base border border-neutral-700 rounded-sm px-3 py-2 text-xs text-neutral-500">
            {ghError.includes("not found")
              ? "gh CLI nicht gefunden — installiere von https://cli.github.com"
              : ghError}
          </div>
        )}

        {/* Pull Requests */}
        {!ghError && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <GitPullRequest className="w-4 h-4 text-neutral-400" />
              <span className="text-xs text-neutral-400 font-medium">
                Pull Requests ({prs.length})
              </span>
            </div>
            {prs.length === 0 ? (
              <div className="text-xs text-neutral-600 pl-5">Keine offenen PRs</div>
            ) : (
              <div className="space-y-1.5">
                {prs.map((pr) => (
                  <div
                    key={pr.number}
                    className="flex items-center gap-2 bg-surface-base border border-neutral-700 rounded-sm px-3 py-2 group hover:border-neutral-600 transition-colors"
                  >
                    <span className="text-xs font-mono text-neutral-500">#{pr.number}</span>
                    <span className="text-xs text-neutral-200 truncate flex-1">{pr.title}</span>
                    <span className="text-xs text-neutral-500">{pr.author}</span>
                    <span className={`text-xs font-medium ${statusColor(pr.status)}`}>
                      {statusLabel(pr.status)}
                    </span>
                    {pr.url && (
                      <a
                        href={pr.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="p-0.5 text-neutral-600 hover:text-neutral-300 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Im Browser oeffnen"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Issues */}
        {!ghError && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <CircleDot className="w-4 h-4 text-neutral-400" />
              <span className="text-xs text-neutral-400 font-medium">
                Issues ({issues.length})
              </span>
            </div>
            {issues.length === 0 ? (
              <div className="text-xs text-neutral-600 pl-5">Keine offenen Issues</div>
            ) : (
              <div className="space-y-1.5">
                {issues.map((issue) => (
                  <div
                    key={issue.number}
                    className="flex items-center gap-2 bg-surface-base border border-neutral-700 rounded-sm px-3 py-2 group hover:border-neutral-600 transition-colors"
                  >
                    <span className="text-xs font-mono text-neutral-500">#{issue.number}</span>
                    <span className="text-xs text-neutral-200 truncate flex-1">{issue.title}</span>
                    {issue.labels.map((label) => (
                      <span
                        key={label}
                        className="text-[10px] px-1.5 py-0.5 bg-accent/10 text-accent rounded-sm"
                      >
                        {label}
                      </span>
                    ))}
                    {issue.assignee && (
                      <span className="text-xs text-neutral-500">{issue.assignee}</span>
                    )}
                    {issue.url && (
                      <a
                        href={issue.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="p-0.5 text-neutral-600 hover:text-neutral-300 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Im Browser oeffnen"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
