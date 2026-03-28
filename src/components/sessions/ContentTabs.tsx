import { useState, useRef, useEffect } from "react";
import { Terminal, FileText, Puzzle, Webhook, Github, ChevronDown, Settings2 } from "lucide-react";

export type PrimaryTab = "terminal" | "config";
export type ConfigSubTab = "claude-md" | "skills" | "hooks" | "github";

// Combined type for backwards compatibility with SessionManagerView
export type ContentTab = "terminal" | ConfigSubTab;

interface ContentTabsProps {
  activeTab: PrimaryTab;
  configSubTab: ConfigSubTab;
  onTabChange: (primary: PrimaryTab, configSub?: ConfigSubTab) => void;
}

const configItems: { id: ConfigSubTab; label: string; icon: typeof FileText }[] = [
  { id: "claude-md", label: "CLAUDE.md", icon: FileText },
  { id: "skills", label: "Skills", icon: Puzzle },
  { id: "hooks", label: "Hooks", icon: Webhook },
  { id: "github", label: "GitHub", icon: Github },
];

export function ContentTabs({ activeTab, configSubTab, onTabChange }: ContentTabsProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [dropdownOpen]);

  const activeConfigItem = configItems.find((c) => c.id === configSubTab) ?? configItems[0];

  return (
    <div className="flex items-center gap-0 h-9 px-2 bg-surface-raised border-b border-neutral-700 shrink-0">
      {/* Terminal tab */}
      <button
        onClick={() => onTabChange("terminal")}
        className={`flex items-center gap-1.5 px-3 h-full text-xs font-medium transition-colors duration-150 border-b-2 ${
          activeTab === "terminal"
            ? "text-accent border-accent bg-accent-a05"
            : "text-neutral-400 border-transparent hover:text-neutral-200 hover:bg-hover-overlay"
        }`}
      >
        <Terminal className="w-3.5 h-3.5" />
        Terminal
      </button>

      {/* Konfig dropdown tab */}
      <div ref={dropdownRef} className="relative h-full">
        <div className="flex h-full">
          {/* Main button: opens last config sub-tab */}
          <button
            onClick={() => onTabChange("config", configSubTab)}
            className={`flex items-center gap-1.5 pl-3 pr-1 h-full text-xs font-medium transition-colors duration-150 border-b-2 ${
              activeTab === "config"
                ? "text-accent border-accent bg-accent-a05"
                : "text-neutral-400 border-transparent hover:text-neutral-200 hover:bg-hover-overlay"
            }`}
          >
            <Settings2 className="w-3.5 h-3.5" />
            <span>Konfig</span>
            {activeTab === "config" && (
              <span className="text-neutral-500 ml-0.5">
                : {activeConfigItem.label}
              </span>
            )}
          </button>
          {/* Chevron: opens dropdown */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setDropdownOpen((prev) => !prev);
            }}
            className={`flex items-center px-1 h-full transition-colors border-b-2 ${
              activeTab === "config"
                ? "text-accent border-accent bg-accent-a05"
                : "text-neutral-400 border-transparent hover:text-neutral-200 hover:bg-hover-overlay"
            }`}
          >
            <ChevronDown className={`w-3 h-3 transition-transform ${dropdownOpen ? "rotate-180" : ""}`} />
          </button>
        </div>

        {/* Dropdown menu */}
        {dropdownOpen && (
          <div className="absolute top-full left-0 mt-0.5 z-50 min-w-[160px] bg-surface-raised border border-neutral-700 rounded-sm shadow-lg py-1">
            {configItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === "config" && configSubTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    onTabChange("config", item.id);
                    setDropdownOpen(false);
                  }}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors ${
                    isActive
                      ? "text-accent bg-accent-a10"
                      : "text-neutral-300 hover:bg-hover-overlay hover:text-neutral-100"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {item.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
