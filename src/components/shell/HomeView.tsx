import { FileText, FolderOpen, PenTool, ArrowRightLeft, ShieldCheck, Trash2, ExternalLink } from 'lucide-react';
import type { RecentDocumentRecord } from '../../services/desktopBridge';

function formatBytes(bytes: number): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function extBadge(name: string): string {
  const ext = name.split('.').pop()?.toUpperCase() || 'FILE';
  return ext.slice(0, 6);
}

function formatDate(ts: number): string {
  try {
    return new Date(ts).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return '—';
  }
}

/**
 * Desktop-style Home view: prominent Open button, recent files, and a
 * full-surface drag-and-drop target (the drop handler lives on the shell host).
 */
export function HomeView({
  recents,
  onOpenFiles,
  onOpenRecent,
  onRemoveRecent,
  onClearRecents,
  onOpenEditor,
  onOpenCanvas,
  onOpenConvert,
  onOpenSecurity,
  onContextMenu
}: {
  recents: RecentDocumentRecord[];
  onOpenFiles: () => void;
  onOpenRecent: (record: RecentDocumentRecord) => void;
  onRemoveRecent: (record: RecentDocumentRecord) => void;
  onClearRecents: () => void;
  onOpenEditor: () => void;
  onOpenCanvas: () => void;
  onOpenConvert: () => void;
  onOpenSecurity: () => void;
  onContextMenu: (e: React.MouseEvent, record: RecentDocumentRecord) => void;
}) {
  const actions = [
    { label: 'PDF Editor', desc: 'Edit text, objects & pages', icon: FileText, onOpen: onOpenEditor },
    { label: '2D Canvas', desc: 'Draw, annotate & arrange', icon: PenTool, onOpen: onOpenCanvas },
    { label: 'Convert', desc: '13 formats, both directions', icon: ArrowRightLeft, onOpen: onOpenConvert },
    { label: 'Security', desc: 'Batch queue · lock · unlock', icon: ShieldCheck, onOpen: onOpenSecurity }
  ];

  return (
    <div className="home-view">
      <div className="home-hero">
        <div>
          <h1 className="home-title">Welcome to Local Desk</h1>
          <p className="home-sub">
            Open a file or drop it anywhere in this window — every tool runs locally on your machine.
          </p>
        </div>
        <button type="button" className="home-open-btn" onClick={onOpenFiles}>
          <FolderOpen size={16} strokeWidth={2} />
          Open file(s)
          <span className="home-open-hint">Ctrl+O</span>
        </button>
      </div>

      <div className="home-actions">
        {actions.map((a) => {
          const Icon = a.icon;
          return (
            <button key={a.label} type="button" className="home-action-card" onClick={a.onOpen}>
              <Icon size={17} strokeWidth={1.8} />
              <span className="home-action-label">{a.label}</span>
              <span className="home-action-desc">{a.desc}</span>
            </button>
          );
        })}
      </div>

      <div className="home-recents-head">
        <h2 className="home-section-title">Recent files</h2>
        {recents.length > 0 && (
          <button type="button" className="home-clear-btn" onClick={onClearRecents} title="Clear recent files">
            <Trash2 size={13} />
            Clear list
          </button>
        )}
      </div>

      {recents.length === 0 ? (
        <div className="home-recents-empty">
          <p>No recent files yet.</p>
          <p className="home-drop-hint">
            <FolderOpen size={14} /> Drop files anywhere in this window — files never leave your machine.
          </p>
        </div>
      ) : (
        <div className="home-recents" role="list">
          {recents.map((r) => (
            <div
              key={r.id}
              role="listitem"
              tabIndex={0}
              className="home-recent-row"
              onClick={() => onOpenRecent(r)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onOpenRecent(r);
              }}
              onContextMenu={(e) => onContextMenu(e, r)}
              title={r.nativePath || r.name}
            >
              <span className="home-recent-badge mono">{extBadge(r.name)}</span>
              <span className="home-recent-name" title={r.name}>
                {r.name}
              </span>
              <span className="home-recent-date mono">{formatDate(r.lastOpenedAt)}</span>
              <span className="home-recent-size mono">{formatBytes(r.size)}</span>
              {r.nativePath && (
                <span
                  className="home-recent-reveal"
                  title="Reveal in Explorer"
                  onClick={(e) => {
                    e.stopPropagation();
                  }}
                >
                  <ExternalLink size={13} />
                </span>
              )}
              <span
                className="home-recent-remove"
                title="Remove from recents"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveRecent(r);
                }}
              >
                <Trash2 size={13} />
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
