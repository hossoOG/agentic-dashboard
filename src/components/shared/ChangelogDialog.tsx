import { motion, AnimatePresence } from "framer-motion";
import { X, GitCommit, Calendar, Tag } from "lucide-react";
import { version } from "../../../package.json";
import changelogRaw from "../../../CHANGELOG.md?raw";

declare const __BUILD_DATE__: string;
declare const __GIT_HASH__: string;

interface ChangelogDialogProps {
  onClose: () => void;
}

/** Parse markdown headings into structured sections */
function parseChangelog(raw: string) {
  const sections: { version: string; date: string; content: string }[] = [];
  const lines = raw.split("\n");
  let current: { version: string; date: string; lines: string[] } | null = null;

  for (const line of lines) {
    const match = line.match(/^## \[(.+?)\]\s*(?:—|-)\s*(.+)/);
    if (match) {
      if (current) {
        sections.push({ version: current.version, date: current.date, content: current.lines.join("\n").trim() });
      }
      current = { version: match[1], date: match[2].trim(), lines: [] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) {
    sections.push({ version: current.version, date: current.date, content: current.lines.join("\n").trim() });
  }
  return sections;
}

function renderContent(content: string) {
  const lines = content.split("\n");
  return lines.map((line, i) => {
    if (line.startsWith("### ")) {
      return (
        <h4 key={i} className="text-xs font-bold text-accent tracking-widest mt-3 mb-1">
          {line.replace("### ", "")}
        </h4>
      );
    }
    if (line.startsWith("- ")) {
      const text = line.slice(2);
      // Bold items: **text**: rest
      const boldMatch = text.match(/^\*\*(.+?)\*\*:?\s*(.*)/);
      if (boldMatch) {
        return (
          <div key={i} className="flex gap-2 text-xs text-neutral-300 ml-2 my-0.5">
            <span className="text-neutral-600 select-none">&#x25B8;</span>
            <span>
              <span className="text-neutral-100 font-semibold">{boldMatch[1]}</span>
              {boldMatch[2] && <span className="text-neutral-400">: {boldMatch[2]}</span>}
            </span>
          </div>
        );
      }
      return (
        <div key={i} className="flex gap-2 text-xs text-neutral-400 ml-2 my-0.5">
          <span className="text-neutral-600 select-none">&#x25B8;</span>
          <span>{text}</span>
        </div>
      );
    }
    if (line.trim()) {
      return <p key={i} className="text-xs text-neutral-400 my-1">{line}</p>;
    }
    return null;
  });
}

export function ChangelogDialog({ onClose }: ChangelogDialogProps) {
  const sections = parseChangelog(changelogRaw);

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center"
        onClick={onClose}
      >
        {/* Overlay */}
        <motion.div
          className="absolute inset-0 bg-black/70"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        />

        {/* Dialog */}
        <motion.div
          className="relative w-full max-w-lg max-h-[80vh] flex flex-col bg-surface-raised border-2 border-neutral-700"
          onClick={(e) => e.stopPropagation()}
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.2 }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-700">
            <div>
              <h2 className="text-accent font-bold text-sm tracking-widest font-display">
                CHANGELOG
              </h2>
              <div className="flex items-center gap-3 mt-1.5">
                <span className="flex items-center gap-1 text-[10px] text-neutral-400">
                  <Tag className="w-3 h-3" /> v{version}
                </span>
                <span className="flex items-center gap-1 text-[10px] text-neutral-400">
                  <GitCommit className="w-3 h-3" /> {__GIT_HASH__}
                </span>
                <span className="flex items-center gap-1 text-[10px] text-neutral-400">
                  <Calendar className="w-3 h-3" /> {__BUILD_DATE__}
                </span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-neutral-500 hover:text-neutral-300 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content — scrollable */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {sections.map((section) => (
              <div
                key={section.version}
                className={`pb-4 border-b border-neutral-800 last:border-0 ${
                  section.version === version ? "" : "opacity-60"
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className={`text-sm font-bold font-mono ${
                      section.version === version ? "text-accent" : "text-neutral-300"
                    }`}
                  >
                    v{section.version}
                  </span>
                  {section.version === version && (
                    <span className="text-[9px] font-bold tracking-wider bg-accent/15 text-accent px-1.5 py-0.5 border border-accent/30">
                      AKTUELL
                    </span>
                  )}
                  <span className="text-[10px] text-neutral-500">{section.date}</span>
                </div>
                {renderContent(section.content)}
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
