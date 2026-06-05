import { useState } from 'react';

export default function ConversationSidebar({ sessions, activeId, onSelect, onNew, onDelete, label = 'Conversations' }) {
  const [hoveredId, setHoveredId] = useState(null);

  return (
    <div style={{
      width: 240,
      flexShrink: 0,
      background: 'var(--bg-surface)',
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 12px 10px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        <span style={{
          flex: 1,
          fontSize: 11,
          fontWeight: 700,
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}>
          {label}
        </span>
        <button className="btn btn-ghost btn-sm" style={{ padding: '2px 8px', fontSize: 12 }} onClick={onNew}>
          + New
        </button>
      </div>

      {/* Session list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 6 }}>
        {sessions.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--text-dim)', padding: '12px 8px', textAlign: 'center' }}>
            No history yet.
          </div>
        )}
        {sessions.map((s) => {
          const isActive = s.id === activeId;
          const isHovered = s.id === hoveredId;
          return (
            <div
              key={s.id}
              onClick={() => onSelect(s.id)}
              onMouseEnter={() => setHoveredId(s.id)}
              onMouseLeave={() => setHoveredId(null)}
              style={{
                position: 'relative',
                padding: '7px 30px 7px 10px',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                background: isActive ? 'var(--bg-raised)' : isHovered ? 'rgba(255,255,255,0.04)' : 'transparent',
                border: isActive ? '1px solid var(--border)' : '1px solid transparent',
                marginBottom: 2,
                fontSize: 13,
                color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                userSelect: 'none',
              }}
            >
              {s.title}
              {onDelete && isHovered && (
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(s.id); }}
                  style={{
                    position: 'absolute',
                    right: 6,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-dim)',
                    fontSize: 12,
                    cursor: 'pointer',
                    padding: '0 2px',
                    lineHeight: 1,
                  }}
                >
                  ✕
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
