import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

// ── Types ────────────────────────────────────────────────────────────

interface FolderProject {
  projectNumber: number;
  projectId: string;
  title: string;
}

interface ProjectState {
  /** Maps folder path → selected project info. Persisted across sessions. */
  projectByFolder: Record<string, FolderProject>;
  setFolderProject: (folder: string, project: FolderProject) => void;
  getProjectForFolder: (folder: string) => FolderProject | undefined;
}

// ── Store ─────────────────────────────────────────────────────────────

export const useProjectStore = create<ProjectState>()(
  persist(
    (set, get) => ({
      projectByFolder: {},

      setFolderProject: (folder, project) =>
        set((state) => ({
          projectByFolder: { ...state.projectByFolder, [folder]: project },
        })),

      getProjectForFolder: (folder) => get().projectByFolder[folder],
    }),
    {
      name: "agentic-project-store",
      storage: createJSONStorage(() => localStorage),
    }
  )
);
