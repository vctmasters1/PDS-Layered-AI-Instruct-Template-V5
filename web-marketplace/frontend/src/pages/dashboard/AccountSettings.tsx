import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { api } from '../../api/client'

const INPUT_STYLE: React.CSSProperties = {
  width: '100%', padding: '8px 12px', borderRadius: 8,
  border: '1px solid var(--border)', background: 'var(--input-bg)',
  color: 'var(--text)', boxSizing: 'border-box', marginTop: 4,
}

const LABEL_STYLE: React.CSSProperties = { fontSize: 13, color: 'var(--text-secondary)' }

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={LABEL_STYLE}>{label}</label>
      {children}
    </div>
  )
}

function Msg({ msg }: { msg: { type: 'success' | 'error'; text: string } | null }) {
  if (!msg) return null
  return (
    <div style={{
      padding: '10px 16px', borderRadius: 8, marginBottom: 16,
      background: msg.type === 'success' ? 'var(--success)' : 'var(--danger)',
      color: 'white', fontSize: 14,
    }}>
      {msg.text}
    </div>
  )
}

function PlaceholderCard({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div style={{
      padding: '16px 20px', borderRadius: 10, border: '1px dashed var(--border)',
      display: 'flex', alignItems: 'center', gap: 14, opacity: 0.7,
    }}>
      <span style={{ fontSize: 28 }}>{icon}</span>
      <div>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{title}</div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{desc}</div>
      </div>
      <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-secondary)' }}>Coming soon</span>
    </div>
  )
}

type TabId = 'security' | 'contact'

export function AccountSettings() {
  const { user } = useAuth()

  const [activeTab, setActiveTab] = useState<TabId>('security')
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwSaving, setPwSaving] = useState(false)

  async function changePassword(e: React.FormEvent) {
    e.preventDefault()
    if (newPw !== confirmPw) { setMsg({ type: 'error', text: 'Passwords do not match' }); return }
    if (newPw.length < 8) { setMsg({ type: 'error', text: 'Password must be at least 8 characters' }); return }
    setPwSaving(true); setMsg(null)
    try {
      await api.post('/auth/change-password', { currentPassword: currentPw, newPassword: newPw })
      setCurrentPw(''); setNewPw(''); setConfirmPw('')
      setMsg({ type: 'success', text: 'Password changed!' })
    } catch (err) {
      setMsg({ type: 'error', text: (err as Error).message })
    } finally { setPwSaving(false) }
  }

  const tabs: { id: TabId; label: string }[] = [
    { id: 'security', label: '🔒 Security' },
    { id: 'contact',  label: '📧 Contact Info' },
  ]

  const tabBtnStyle = (id: TabId): React.CSSProperties => ({
    padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13,
    fontWeight: activeTab === id ? 600 : 400,
    background: activeTab === id ? 'var(--primary)' : 'var(--bg-secondary)',
    color: activeTab === id ? 'white' : 'var(--text)',
  })

  return (
    <div style={{ maxWidth: 560 }}>
      <h2 style={{ marginBottom: 6 }}>Account Settings</h2>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
        Security, login credentials, and account management.
      </p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 28 }}>
        {tabs.map(t => (
          <button key={t.id} style={tabBtnStyle(t.id)} onClick={() => { setActiveTab(t.id); setMsg(null) }}>
            {t.label}
          </button>
        ))}
      </div>

      <Msg msg={msg} />

      {activeTab === 'security' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <form onSubmit={changePassword} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <h3 style={{ margin: 0 }}>Change Password</h3>
            <Field label="Current Password">
              <input type="password" value={currentPw} onChange={e => setCurrentPw(e.target.value)} required style={INPUT_STYLE} />
            </Field>
            <Field label="New Password">
              <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} required style={INPUT_STYLE} />
            </Field>
            <Field label="Confirm New Password">
              <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} required style={INPUT_STYLE} />
            </Field>
            <button type="submit" className="btn-primary" disabled={pwSaving} style={{ alignSelf: 'flex-start', padding: '8px 24px' }}>
              {pwSaving ? 'Saving…' : 'Change Password'}
            </button>
          </form>

          <hr style={{ border: 'none', borderTop: '1px solid var(--border)' }} />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <h3 style={{ margin: 0 }}>Account Actions</h3>
            <PlaceholderCard icon="😴" title="Hibernate Account" desc="Pause your account — your profile and listings are hidden until you return." />
            <PlaceholderCard icon="🗑️" title="Delete Account" desc="Permanently delete your account, listings, and all associated data." />
          </div>
        </div>
      )}

      {activeTab === 'contact' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <h3 style={{ margin: 0 }}>Login Email</h3>
          <Field label="Email Address">
            <input value={user?.email ?? ''} disabled
              style={{ ...INPUT_STYLE, background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }} />
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
              This is your login email. Contact support to change it.
            </div>
          </Field>

          <hr style={{ border: 'none', borderTop: '1px solid var(--border)' }} />

          <h3 style={{ margin: 0 }}>Preferences</h3>
          <PlaceholderCard icon="💳" title="Payment Preferences" desc="Saved cards, billing address, and payout settings." />
          <PlaceholderCard icon="🔔" title="Notification Preferences" desc="Control which emails and alerts you receive." />
        </div>
      )}
    </div>
  )
}
