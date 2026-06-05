import type { MsgConversation } from './types'

interface Props {
  conversations: MsgConversation[]
  activeUserId: string | null
  onSelect: (userId: string, name: string) => void
  searchQuery: string
  onSearchChange: (v: string) => void
}

export function ConversationList({ conversations, activeUserId, onSelect, searchQuery, onSearchChange }: Props) {
  return (
    <div style={{
      width: 260, minWidth: 200, display: 'flex', flexDirection: 'column',
      borderRight: '1px solid var(--border)', background: 'var(--bg, white)',
    }}>
      {/* Search bar */}
      <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
        <input
          type="search"
          placeholder="Search messages…"
          value={searchQuery}
          onChange={e => onSearchChange(e.target.value)}
          style={{
            width: '100%', padding: '6px 10px', fontSize: 13,
            border: '1px solid var(--border)', borderRadius: 6,
            background: 'var(--card-bg)', color: 'var(--text)',
            boxSizing: 'border-box',
          }}
        />
      </div>

      <div style={{ overflowY: 'auto', flex: 1 }}>
        {conversations.length === 0 ? (
          <div style={{ padding: 16, color: 'var(--text-secondary)', fontSize: 13 }}>
            No conversations yet.
          </div>
        ) : (
          conversations.map(conv => {
            const u = conv.otherUser
            const name = u.displayName || [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email
            const isActive = u.id === activeUserId
            return (
              <div
                key={u.id}
                onClick={() => onSelect(u.id, name)}
                style={{
                  padding: '12px 14px', cursor: 'pointer',
                  background: isActive ? 'var(--primary, #2563eb)' : 'transparent',
                  color: isActive ? 'white' : 'var(--text)',
                  borderBottom: '1px solid var(--border)',
                  transition: 'background 0.15s',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{name}</span>
                  <span style={{ fontSize: 11, opacity: 0.65 }}>
                    {new Date(conv.lastMessage.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, opacity: 0.7, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>
                    {conv.lastMessage.content.substring(0, 60)}{conv.lastMessage.content.length > 60 ? '…' : ''}
                  </span>
                  {conv.unreadCount > 0 && (
                    <span style={{
                      fontSize: 11, background: isActive ? 'white' : 'var(--danger, #ef4444)',
                      color: isActive ? 'var(--primary, #2563eb)' : 'white',
                      padding: '1px 6px', borderRadius: 10, flexShrink: 0, marginLeft: 4,
                    }}>
                      {conv.unreadCount}
                    </span>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
