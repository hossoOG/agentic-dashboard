import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

interface GitInfo {
  branch: string;
}

export function useGitBranch(folder: string | undefined): { branch: string | null } {
  const [branch, setBranch] = useState<string | null>(null);

  useEffect(() => {
    if (!folder) {
      setBranch(null);
      return;
    }

    let cancelled = false;

    async function fetchBranch() {
      try {
        const info = await invoke<GitInfo>("get_git_info", { folder });
        if (!cancelled) {
          setBranch(info.branch && info.branch !== "HEAD" ? info.branch : null);
        }
      } catch {
        if (!cancelled) setBranch(null);
      }
    }

    void fetchBranch();
    const interval = setInterval(() => void fetchBranch(), 30_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [folder]);

  return { branch };
}
