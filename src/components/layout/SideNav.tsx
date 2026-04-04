import { Monitor, Activity, Columns3, ScrollText, BookOpen, Settings, FileEdit } from "lucide-react";
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
    { id: "sessions", label: "Sessions", icon: Monitor, badge: badges.sessions },
    { id: "pipeline", label: "Pipeline", icon: Activity, badge: badges.pipeline },
    { id: "kanban", label: "Kanban", icon: Columns3, badge: badges.kanban },
    { id: "library", label: "Library", icon: BookOpen, badge: badges.library },
    { id: "editor", label: "Editor", icon: FileEdit, badge: badges.editor },
  ];

  const bottomItems: NavItem[] = [
    { id: "logs", label: "Logs", icon: ScrollText, badge: badges.logs },
    { id: "settings", label: "Einstellungen", icon: Settings, badge: badges.settings },
  ];

  function renderItem(item: NavItem) {
    const isActive = activeTab === item.id;
    const Icon = item.icon;

    return (
      <button
        key={item.id}
        onClick={() => setActiveTab(item.id)}
        className={`
          relative group flex items-center justify-center w-10 h-10 rounded-none
          transition-all duration-150
          ${isActive
            ? "text-accent bg-accent-a10 border-l-2 border-accent"
            : "text-neutral-400 hover:text-neutral-200 hover:bg-hover-overlay border-l-2 border-transparent"
          }
        `}
        aria-label={item.label}
      >
        <Icon className="w-5 h-5" />

        {/* Badge */}
        {item.badge != null && item.badge > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-error text-white text-[9px] font-bold px-1">
            {item.badge > 99 ? "99+" : item.badge}
          </span>
        )}

        {/* Tooltip */}
        <span className="absolute left-full ml-2 px-2 py-1 text-xs text-neutral-100 bg-surface-raised border border-neutral-700 rounded-none whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
          {item.label}
        </span>
      </button>
    );
  }

  return (
    <nav className="flex flex-col items-center w-12 min-w-[48px] bg-surface-base border-r border-neutral-700 py-2 gap-1">
      {topItems.map(renderItem)}
      <div className="mt-auto flex flex-col items-center gap-1">
        {bottomItems.map(renderItem)}
      </div>
    </nav>
  );
}
