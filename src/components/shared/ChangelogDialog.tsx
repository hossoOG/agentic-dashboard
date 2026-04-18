import { GitCommit, Calendar, Tag } from "lucide-react";
import { version } from "../../../package.json";
import changelogRaw from "../../../CHANGELOG.md?raw";
import { Modal } from "../ui";

declare const __BUILD_DATE__: string;
declare const __GIT_HASH__: string;

interface ChangelogDialogProps {
  open: boolean;
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

const PARSED_SECTIONS = parseChangelog(changelogRaw);

export function ChangelogDialog({ open, onClose }: ChangelogDialogProps) {
  const sections = PARSED_SECTIONS;

  const headerTitle = (
    <div>
      <h2 className="text-accent font-bold text-sm uppercase tracking-widest font-display">
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
  );

  return (
    <Modal open={open} onClose={onClose} title={headerTitle} size="lg" className="max-h-[80vh]">
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
    </Modal>
  );
}
