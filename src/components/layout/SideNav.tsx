import { Monitor, Activity, Columns3, ScrollText, BookOpen, FileEdit } from "lucide-react";
import { useUIStore, type ActiveTab } from "../../store/uiStore";

interface NavItem {
  id: ActiveTab;
  label: string;
  icon: typeof Activity;
  badge?: number;
}

interface SideNavProps {
  badges?: Partial<Record<ActiveTab, number>>;
}

export function SideNav({ badges = {} }: SideNavProps) {
  const { activeTab, setActiveTab } = useUIStore();

  const topItems: NavItem[] = [
    { id: "sessions", label: "Sitzungen", icon: Monitor, badge: badges.sessions },
    { id: "pipeline", label: "Pipeline", icon: Activity, badge: badges.pipeline },
    { id: "kanban", label: "Kanban", icon: Columns3, badge: badges.kanban },
    { id: "library", label: "Bibliothek", icon: BookOpen, badge: badges.library },
    { id: "editor", label: "Editor", icon: FileEdit, badge: badges.editor },
  ];

  const bottomItems: NavItem[] = [
    { id: "logs", label: "Protokolle", icon: ScrollText, badge: badges.logs },
  ];

  function renderItem(item: NavItem) {
    const isActive = activeTab === item.id;
    const Icon = item.icon;

    return (
      <button
        key={item.id}
        onClick={() => setActiveTab(item.id)}
        className={`
          relative flex items-center gap-2 w-full h-9 px-3 rounded-none
          transition-all duration-150 text-left
          ${isActive
            ? "text-accent bg-accent-a10 border-l-2 border-accent"
            : "text-neutral-400 hover:text-neutral-200 hover:bg-hover-overlay border-l-2 border-transparent"
          }
        `}
        aria-label={item.label}
      >
        <Icon className="w-4 h-4 shrink-0" />
        <span className="text-xs truncate">{item.label}</span>

        {/* Badge */}
        {item.badge != null && item.badge > 0 && (
          <span className="ml-auto min-w-[16px] h-4 flex items-center justify-center rounded-full bg-error text-white text-[9px] font-bold px-1">
            {item.badge > 99 ? "99+" : item.badge}
          </span>
        )}
      </button>
    );
  }

  return (
    <nav className="flex flex-col w-32 min-w-[128px] bg-surface-base border-r border-neutral-700 py-2 gap-0.5">
      {topItems.map(renderItem)}
      <div className="mt-auto flex flex-col gap-0.5">
        {bottomItems.map(renderItem)}
      </div>
    </nav>
  );
}
