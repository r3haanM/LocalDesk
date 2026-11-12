import { House, FileText, PenTool, ArrowRightLeft, ShieldCheck, Settings } from 'lucide-react';

export type ShellView = 'home' | 'editor' | 'canvas' | 'convert' | 'security' | 'settings';

export interface RailItem {
  key: ShellView;
  label: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
}

export const RAIL_ITEMS: RailItem[] = [
  { key: 'home', label: 'Home', icon: House },
  { key: 'editor', label: 'PDF Editor', icon: FileText },
  { key: 'canvas', label: '2D Canvas', icon: PenTool },
  { key: 'convert', label: 'Convert', icon: ArrowRightLeft },
  { key: 'security', label: 'Security', icon: ShieldCheck },
  { key: 'settings', label: 'Settings', icon: Settings }
];

/**
 * Left navigation rail: 200px labeled nav, collapsing to a 48px icon rail
 * under 1100px window width. App mark at top, version number at bottom.
 */
export function SideRail({
  view,
  onSelect,
  collapsed
}: {
  view: ShellView;
  onSelect: (view: ShellView) => void;
  collapsed: boolean;
}) {
  return (
    <nav className={`shell-rail${collapsed ? ' collapsed' : ''}`} aria-label="Primary">
      <div className="shell-rail-mark" title="Local Desk">
        {/* Official Local Desk app icon (verbatim) */}
        <svg width="22" height="22" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="ld-rail-bg" x1="8" y1="6" x2="56" y2="58" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#142C23" />
              <stop offset="100%" stopColor="#0A1712" />
            </linearGradient>
            <linearGradient id="ld-rail-frame" x1="14" y1="14" x2="50" y2="50" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#34D399" />
              <stop offset="45%" stopColor="#10B981" />
              <stop offset="100%" stopColor="#059669" />
            </linearGradient>
            <linearGradient id="ld-rail-sheet" x1="28" y1="14" x2="50" y2="36" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#F7FCF9" />
              <stop offset="100%" stopColor="#D1FAE5" />
            </linearGradient>
          </defs>
          <rect x="4" y="4" width="56" height="56" rx="14" fill="url(#ld-rail-bg)" />
          <rect x="4.75" y="4.75" width="54.5" height="54.5" rx="13.25" stroke="#34D399" strokeOpacity="0.24" strokeWidth="1.25" />
          <path d="M14 18C14 15.7909 15.7909 14 18 14H21C22.3807 14 23.5 15.1193 23.5 16.5V38C23.5 39.3807 24.6193 40.5 26 40.5H47.5C48.8807 40.5 50 41.6193 50 43V46C50 48.2091 48.2091 50 46 50H18C15.7909 50 14 48.2091 14 46V18Z" fill="url(#ld-rail-frame)" />
          <path d="M28 16.5C28 15.1193 29.1193 14 30.5 14H41L50 23V33.5C50 34.8807 48.8807 36 47.5 36H30.5C29.1193 36 28 33.5 28 33.5V16.5Z" fill="url(#ld-rail-sheet)" />
          <path d="M41 14V20.5C41 21.8807 42.1193 23 43.5 23H50L41 14Z" fill="#10B981" />
          <rect x="32.5" y="23" width="11.5" height="2.6" rx="1.3" fill="#0D1F18" />
          <rect x="32.5" y="28" width="7.5" height="2.6" rx="1.3" fill="#059669" />
        </svg>
        {!collapsed && <span className="shell-rail-word">Local Desk</span>}
      </div>

      <div className="shell-rail-items">
        {RAIL_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = view === item.key || (item.key === 'editor' && view === 'canvas');
          return (
            <button
              key={item.key}
              type="button"
              className={`shell-rail-item${view === item.key ? ' active' : ''}`}
              title={collapsed ? item.label : undefined}
              aria-label={item.label}
              aria-current={view === item.key ? 'page' : undefined}
              onClick={() => onSelect(item.key)}
            >
              <Icon size={18} strokeWidth={1.8} />
              {!collapsed && <span>{item.label}</span>}
            </button>
          );
        })}
      </div>

      <div className="shell-rail-footer">
        <span className="mono">{`v${__APP_VERSION__}`}</span>
      </div>
    </nav>
  );
}
