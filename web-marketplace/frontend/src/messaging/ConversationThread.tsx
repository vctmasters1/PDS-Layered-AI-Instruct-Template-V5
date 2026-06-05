import { useState, useEffect, useRef, useCallback } from 'react'
import { getThread, checkFee, sendMessage, grantWaiver, revokeWaiver } from './api'
import type { MsgMessage, FeeCheck } from './types'

interface Props {
  otherUserId: string
  otherUserName: string
  currentUserId: string
  onClose: () => void
  onMessageSent: () => void   // tells MessagingPage to refresh fee banner + conv list
  onReportUser: (userId: string) => void
}

export function ConversationThread({ otherUserId, otherUserName, currentUserId, onClose, onMessageSent, onReportUser }: Props) {
  const [messages, setMessages] = useState<MsgMessage[]>([])
  const [fee, setFee] = useState<FeeCheck | null>(null)
  const [loading, setLoading] = useState(true)
  const [content, setContent] = useState('')
  const [sending, setSending] = useState(false)
  const [feeToast, setFeeToast] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [threadRes, feeRes] = await Promise.all([
        getThread(otherUserId),
        checkFee(otherUserId),
      ])
      setMessages(threadRes.conversation.messages)
      setFee(feeRes)
    } catch {
      // ignore — empty state
    } finally {
      setLoading(false)
    }
  }, [otherUserId])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Derived fee display state
  const isResponder = !!fee?.isResponder
  const theyWaivedForMe = !!fee?.waived
  const iGrantedWaiver = !!fee?.grantedWaiverToThem
  const responderHasReplied = !!fee?.responderHasReplied
  const allFree = theyWaivedForMe || (isResponder && iGrantedWaiver) || theyWaivedForMe

  // Badge shown in thread header
  function renderFeeBadge() {
    if (allFree) {
      return <span style={badge('green')}>✅ All fees waived — free messaging</span>
    }
    if (theyWaivedForMe) {
      return <span style={badge('green')}>✅ Fees waived for you</span>
    }
    if (isResponder && iGrantedWaiver) {
      return <span style={badge('green')}>✅ Fees waived both ways — free messaging</span>
    }
    if (isResponder) {
      return responderHasReplied
        ? <span style={badge('green')}>✅ Replies are free · Earning $0.33 per incoming message</span>
        : <span style={badge('green')}>✅ Replies are free · Reply to start earning $0.33/msg</span>
    }
    return <span style={badge('amber')}>💰 $1.00 per message · Billed every 24 hrs</span>
  }

  // Notice shown above send button
  function renderSendNotice() {
    if (allFree || theyWaivedForMe || (isResponder && iGrantedWaiver)) {
      return <span style={{ color: 'var(--success, #22c55e)', fontSize: 13 }}>✅ No fees — free messaging</span>
    }
    if (isResponder) {
      return responderHasReplied
        ? <span style={{ color: 'var(--success, #22c55e)', fontSize: 13 }}>✅ Replies are free. Earning <strong>$0.33</strong> per incoming message.</span>
        : <span style={{ color: 'var(--success, #22c55e)', fontSize: 13 }}>✅ Replies are free. Reply to start earning <strong>$0.33</strong>/msg.</span>
    }
    return <span style={{ fontSize: 13 }}>💰 Sending costs <strong>$1.00</strong>/message. Billed every 24 hrs.</span>
  }

  // Label for send button
  const sendLabel = isResponder || allFree || theyWaivedForMe ? 'Reply' : 'Send ($1.00)'

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    const text = content.trim()
    if (!text) return

    // Confirm fee for non-responder initiators
    if (!isResponder && !allFree && !theyWaivedForMe && fee?.feeApplies) {
      const ok = window.confirm(
        '💰 This message costs $1.00.\n\n' +
        'After Stripe processing ($0.33), the remaining $0.67 is split:\n' +
        '  • PipeDream: $0.34\n' +
        '  • Recipient: $0.33\n\n' +
        '(Recipient earns their share only after they respond.)\n' +
        'Fees are billed at the end of each 24-hour period.\n\n' +
        'Send this message?'
      )
      if (!ok) return
    }

    setSending(true)
    try {
      const result = await sendMessage(otherUserId, text)
      // Show fee toast for paid messages
      if (result.fee && !result.fee.waived) {
        const toastMsg = `💰 $${Number(result.fee.amount).toFixed(2)} fee added · ${result.fee.note}`
        setFeeToast(toastMsg)
        setTimeout(() => setFeeToast(null), 6000)
      }
      setContent('')
      // Reload thread + fee in parallel, then notify parent to refresh conv list + fee banner
      await Promise.all([getThread(otherUserId), checkFee(otherUserId)]).then(([threadRes, feeRes]) => {
        setMessages(threadRes.conversation.messages)
        setFee(feeRes)
      })
      onMessageSent()
    } catch (err) {
      alert('Failed to send: ' + (err as Error).message)
    } finally {
      setSending(false)
    }
  }

  async function handleWaiverToggle() {
    // Re-check to get current waiver state
    const current = await checkFee(otherUserId).catch(() => null)
    const alreadyGranted = !!current?.grantedWaiverToThem

    if (alreadyGranted) {
      const ok = window.confirm(
        `🎫 Fee Waiver Active for ${otherUserName}\n\n` +
        `You currently waive fees for ${otherUserName} — they message you for free (but you don't earn $0.33 on their messages).\n\n` +
        `Revoke this waiver? (They'll pay $1.00 per message again, and you'll earn $0.33.)`
      )
      if (!ok) return
      try {
        await revokeWaiver(otherUserId)
        alert(`Fee waiver revoked for ${otherUserName}. Standard fees apply again.`)
      } catch (err) {
        alert('Failed to revoke waiver: ' + (err as Error).message)
        return
      }
    } else {
      const ok = window.confirm(
        `🎫 Fee Waiver for ${otherUserName}\n\n` +
        `Waiving fees means ${otherUserName} can message you for free.\n` +
        `This encourages communication but you won't earn the $0.33 recipient share on their messages.\n\n` +
        `Grant a fee waiver for ${otherUserName}?`
      )
      if (!ok) return
      try {
        await grantWaiver(otherUserId)
        alert(`✅ Fee waiver granted for ${otherUserName}. They can now message you for free.`)
      } catch (err) {
        alert('Failed to grant waiver: ' + (err as Error).message)
        return
      }
    }
    // Refresh
    const feeRes = await checkFee(otherUserId).catch(() => null)
    if (feeRes) setFee(feeRes)
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
      {/* Header */}
      <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{otherUserName}</div>
          {fee && renderFeeBadge()}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* Waiver button — only for responder */}
          {!loading && isResponder && (
            <button onClick={handleWaiverToggle} style={btnSmStyle} title="Manage fee waiver for this user">
              🎫 Manage Fee Waiver
            </button>
          )}
          <button
            onClick={() => onReportUser(otherUserId)}
            style={{ ...btnSmStyle, color: 'var(--text-secondary)' }}
            title="Report this user"
          >
            🚩
          </button>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--text-secondary)', lineHeight: 1 }} title="Back to conversations">
            ✕
          </button>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {loading ? (
          <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Loading…</div>
        ) : messages.length === 0 ? (
          <div style={{ color: 'var(--text-secondary)', fontSize: 13, textAlign: 'center', marginTop: 40 }}>
            No messages yet. Send one to start the conversation.
          </div>
        ) : (
          messages.map(msg => {
            const isMine = msg.senderId === currentUserId
            return (
              <div key={msg.id} style={{ display: 'flex', justifyContent: isMine ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '70%', padding: '10px 14px', borderRadius: 10,
                  background: isMine ? 'var(--primary, #2563eb)' : 'var(--card-bg, #f3f4f6)',
                  color: isMine ? 'white' : 'var(--text)',
                  wordBreak: 'break-word',
                }}>
                  <p style={{ margin: 0, lineHeight: 1.45, fontSize: 14 }}>{msg.content}</p>
                  <small style={{ display: 'block', opacity: 0.65, marginTop: 4, fontSize: 11 }}>
                    {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    {!msg.read && !isMine && <span style={{ marginLeft: 6 }}>•</span>}
                  </small>
                </div>
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Send form */}
      <form onSubmit={handleSend} style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 13 }}>{renderSendNotice()}</div>
        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder="Type your message…"
          rows={3}
          disabled={sending}
          style={{
            padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 6,
            fontFamily: 'inherit', fontSize: 14, resize: 'vertical',
            background: 'var(--card-bg)', color: 'var(--text)',
          }}
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault()
              handleSend(e as unknown as React.FormEvent)
            }
          }}
        />
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="submit"
            disabled={sending || !content.trim()}
            style={{ flex: 1, padding: '9px 0', borderRadius: 6, border: 'none', background: 'var(--primary, #2563eb)', color: 'white', fontWeight: 600, fontSize: 14, cursor: sending ? 'not-allowed' : 'pointer', opacity: sending ? 0.7 : 1 }}
          >
            {sending ? 'Sending…' : sendLabel}
          </button>
          <button type="button" onClick={onClose} style={{ padding: '9px 18px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', cursor: 'pointer', fontSize: 14 }}>
            Cancel
          </button>
        </div>
        <p style={{ margin: 0, fontSize: 11, color: 'var(--text-secondary)' }}>Ctrl+Enter to send</p>
      </form>

      {/* Fee toast */}
      {feeToast && (
        <div style={{
          position: 'absolute', bottom: 80, right: 20,
          background: 'var(--card-bg, white)', border: '1px solid var(--border)',
          borderLeft: '4px solid #f59e0b', padding: '10px 16px',
          borderRadius: 8, fontSize: 13, boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          maxWidth: 360, zIndex: 100,
        }}>
          {feeToast}
        </div>
      )}
    </div>
  )
}

function badge(color: 'green' | 'amber'): React.CSSProperties {
  return {
    display: 'inline-block', marginTop: 3, fontSize: 12,
    padding: '2px 8px', borderRadius: 12,
    background: color === 'green' ? 'var(--success-bg, #dcfce7)' : 'var(--warning-bg, #fef9c3)',
    color: color === 'green' ? 'var(--success, #15803d)' : 'var(--warning, #92400e)',
  }
}

const btnSmStyle: React.CSSProperties = {
  fontSize: 12, padding: '5px 10px', borderRadius: 5,
  border: '1px solid var(--border)', background: 'transparent',
  cursor: 'pointer', color: 'var(--text)',
}
