import { useState, useEffect, useRef } from 'react'
import { useAsyncData } from '../../hooks/useAsyncData'
import { fetchConversations, fetchMessages, sendMessage } from '../../api/messaging'
import { useAuth } from '../../context/AuthContext'
import type { Conversation, Message } from '../../types'

function ConvItem({ conv, active, onClick }: { conv: Conversation; active: boolean; onClick: () => void }) {
  const other = conv.participants.find(p => p) // first participant shown
  const name = other ? `${other.firstName ?? ''} ${other.lastName ?? ''}`.trim() || other.email : 'Unknown'
  return (
    <div onClick={onClick} style={{
      padding: '12px 16px', cursor: 'pointer',
      background: active ? 'var(--primary)' : 'var(--card-bg)',
      color: active ? 'white' : 'var(--text)',
      borderBottom: '1px solid var(--border)',
    }}>
      <div style={{ fontWeight: 600, fontSize: 14 }}>{name}</div>
      {conv.lastMessage && (
        <div style={{ fontSize: 12, opacity: 0.75, marginTop: 2, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
          {conv.lastMessage.body}
        </div>
      )}
      {(conv.unreadCount ?? 0) > 0 && (
        <span style={{ fontSize: 11, background: 'var(--danger)', color: 'white', padding: '1px 6px', borderRadius: 10, marginTop: 4, display: 'inline-block' }}>
          {conv.unreadCount}
        </span>
      )}
    </div>
  )
}

export function Messaging() {
  const { user } = useAuth()
  const [activeConvId, setActiveConvId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [msgLoading, setMsgLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const { data, loading, error, reload } = useAsyncData(() => fetchConversations(), [])
  const conversations = data?.conversations ?? []
  const activeConv = conversations.find(c => c.id === activeConvId) ?? null

  useEffect(() => {
    if (!activeConvId) return
    setMsgLoading(true)
    fetchMessages(activeConvId)
      .then(d => setMessages(d.messages))
      .catch(() => {})
      .finally(() => setMsgLoading(false))
  }, [activeConvId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!body.trim() || !activeConvId) return
    setSending(true)
    try {
      const msg = await sendMessage(activeConvId, body.trim())
      setMessages(m => [...m, msg])
      setBody('')
      reload()
    } catch (err) {
      alert('Failed to send: ' + (err as Error).message)
    } finally { setSending(false) }
  }

  if (loading) return <div style={{ color: 'var(--text-secondary)' }}>Loading conversations…</div>
  if (error) return <div style={{ color: 'var(--danger)' }}>⚠ {error}</div>

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 200px)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
      {/* Sidebar */}
      <div style={{ width: 260, minWidth: 200, borderRight: '1px solid var(--border)', overflowY: 'auto', background: 'var(--bg)' }}>
        <div style={{ padding: '12px 16px', fontWeight: 700, borderBottom: '1px solid var(--border)' }}>Conversations</div>
        {conversations.length === 0 ? (
          <div style={{ padding: 16, color: 'var(--text-secondary)', fontSize: 13 }}>No conversations yet.</div>
        ) : conversations.map(c => (
          <ConvItem key={c.id} conv={c} active={c.id === activeConvId} onClick={() => setActiveConvId(c.id)} />
        ))}
      </div>

      {/* Thread */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {!activeConv ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
            Select a conversation
          </div>
        ) : (
          <>
            <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', fontWeight: 600 }}>
              {activeConv.participants.find(p => p.id !== user?.id)?.email ?? 'Conversation'}
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {msgLoading ? (
                <div style={{ color: 'var(--text-secondary)' }}>Loading messages…</div>
              ) : messages.map(m => {
                const isOwn = m.senderId === user?.id
                return (
                  <div key={m.id} style={{ display: 'flex', justifyContent: isOwn ? 'flex-end' : 'flex-start' }}>
                    <div style={{
                      maxWidth: '70%', padding: '10px 14px', borderRadius: 12,
                      background: isOwn ? 'var(--primary)' : 'var(--card-bg)',
                      color: isOwn ? 'white' : 'var(--text)',
                      border: isOwn ? 'none' : '1px solid var(--border)',
                      fontSize: 14,
                    }}>
                      {m.body}
                      <div style={{ fontSize: 10, opacity: 0.65, marginTop: 4, textAlign: isOwn ? 'right' : 'left' }}>
                        {new Date(m.createdAt).toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                )
              })}
              <div ref={bottomRef} />
            </div>
            <form onSubmit={handleSend} style={{ display: 'flex', gap: 8, padding: '12px 20px', borderTop: '1px solid var(--border)' }}>
              <input
                value={body} onChange={e => setBody(e.target.value)}
                placeholder="Type a message…"
                style={{ flex: 1, padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)' }}
              />
              <button type="submit" className="btn-primary" disabled={sending || !body.trim()}>
                {sending ? '…' : 'Send'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
