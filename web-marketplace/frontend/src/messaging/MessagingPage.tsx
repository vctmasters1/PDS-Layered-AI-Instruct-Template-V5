import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { getConversations, searchMessages } from './api'
import { ConversationList } from './ConversationList'
import { ConversationThread } from './ConversationThread'
import { FeeBanner, useFeeSummary } from './FeeBanner'
import type { MsgConversation } from './types'

export function MessagingPage() {
  const { user } = useAuth()
  const [conversations, setConversations] = useState<MsgConversation[]>([])
  const [convLoading, setConvLoading] = useState(true)
  const [activeUserId, setActiveUserId] = useState<string | null>(null)
  const [activeUserName, setActiveUserName] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<{ id: string; subject: string; content: string; createdAt: string }[] | null>(null)

  const { summary, refresh: refreshFees } = useFeeSummary()

  function loadConversations() {
    setConvLoading(true)
    getConversations()
      .then(d => setConversations(d.conversations))
      .catch(() => setConversations([]))
      .finally(() => setConvLoading(false))
  }

  useEffect(() => { loadConversations() }, [])

  // Debounced search
  useEffect(() => {
    if (!searchQuery || searchQuery.length < 2) {
      setSearchResults(null)
      return
    }
    const timer = setTimeout(() => {
      searchMessages(searchQuery)
        .then(d => setSearchResults(d.results as never))
        .catch(() => setSearchResults([]))
    }, 400)
    return () => clearTimeout(timer)
  }, [searchQuery])

  function handleSelect(userId: string, name: string) {
    setActiveUserId(userId)
    setActiveUserName(name)
    setSearchQuery('')
    setSearchResults(null)
  }

  function handleClose() {
    setActiveUserId(null)
    setActiveUserName('')
  }

  function handleMessageSent() {
    loadConversations()
    refreshFees()
  }

  function handleReportUser(userId: string) {
    // Report modal integration — for now open a basic confirm
    // Reuse the global report mechanism if available
    const w = window as unknown as Record<string, unknown>
    if (typeof w.showReportModal === 'function') {
      ;(w.showReportModal as (type: string, id: string, reportedId: string) => void)('user', userId, userId)
    } else {
      alert(`To report ${activeUserName}, please contact support@pds.local with the user ID: ${userId}`)
    }
  }

  if (!user) {
    return <div style={{ padding: 32, color: 'var(--text-secondary)' }}>Please sign in to view messages.</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)' }}>
      {/* Fee summary banner */}
      <FeeBanner summary={summary} />

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Conversation list sidebar */}
        {convLoading ? (
          <div style={{ width: 260, padding: 16, color: 'var(--text-secondary)', fontSize: 13 }}>Loading…</div>
        ) : (
          <ConversationList
            conversations={conversations}
            activeUserId={activeUserId}
            onSelect={handleSelect}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
          />
        )}

        {/* Search results overlay (replaces thread pane) */}
        {searchResults !== null ? (
          <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
            <div style={{ fontWeight: 600, marginBottom: 12, fontSize: 14 }}>
              Search results for "{searchQuery}"
              <button onClick={() => { setSearchQuery(''); setSearchResults(null) }} style={{ marginLeft: 12, fontSize: 12, padding: '3px 8px', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', background: 'transparent' }}>
                Clear
              </button>
            </div>
            {searchResults.length === 0 ? (
              <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>No results found.</div>
            ) : (
              searchResults.map((r: { id: string; subject: string; content: string; createdAt: string }) => (
                <div key={r.id} style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: 14 }}>
                  <div style={{ fontWeight: 600 }}>{r.subject}</div>
                  <div style={{ marginTop: 4, color: 'var(--text-secondary)' }}>{r.content}</div>
                  <small style={{ color: 'var(--text-secondary)' }}>{new Date(r.createdAt).toLocaleString()}</small>
                </div>
              ))
            )}
          </div>
        ) : !activeUserId ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: 14 }}>
            Select a conversation to read messages.
          </div>
        ) : (
          <ConversationThread
            otherUserId={activeUserId}
            otherUserName={activeUserName}
            currentUserId={user.id}
            onClose={handleClose}
            onMessageSent={handleMessageSent}
            onReportUser={handleReportUser}
          />
        )}
      </div>
    </div>
  )
}
