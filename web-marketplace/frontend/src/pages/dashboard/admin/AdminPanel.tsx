import { useState } from 'react'
import { useAsyncData } from '../../../hooks/useAsyncData'
import { useAuth } from '../../../context/AuthContext'
import {
  fetchAdminStats, fetchAdminUsers, fetchAdminOrders, fetchDisputes,
  fetchSiteSettings, updateUserRole, updateUserServiceAccess, suspendUser, unsuspendUser,
  verifyUser, resolveDispute, updateSiteSettings,
} from '../../../api/admin'
import type { AdminUser, Dispute, SiteSettings } from '../../../types'
import { Navigate } from 'react-router-dom'

type Tab = 'users' | 'orders' | 'disputes' | 'settings'

// ─── Stats bar ────────────────────────────────────────────────────────────

function StatsBar() {
  const { data, loading } = useAsyncData(() => fetchAdminStats(), [])
  if (loading) return <div style={{ color: 'var(--text-secondary)', marginBottom: 24 }}>Loading stats…</div>
  if (!data) return null
  const stats = [
    { icon: '👥', label: 'Users', value: data.totalUsers },
    { icon: '📦', label: 'Products', value: data.totalProducts },
    { icon: '🛒', label: 'Orders', value: data.totalOrders },
    { icon: '💰', label: 'Revenue', value: `$${(data.totalRevenue ?? 0).toFixed(0)}` },
    { icon: '🎨', label: 'Designers', value: data.activeDesigners },
    { icon: '🏭', label: 'Producers', value: data.activeProducers },
    { icon: '⚖️', label: 'Disputes', value: data.pendingDisputes },
  ]
  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
      {stats.map(s => (
        <div key={s.label} style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px', minWidth: 100, textAlign: 'center' }}>
          <div style={{ fontSize: 22 }}>{s.icon}</div>
          <div style={{ fontWeight: 700, fontSize: 20 }}>{s.value}</div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{s.label}</div>
        </div>
      ))}
    </div>
  )
}

// ─── Users Tab ────────────────────────────────────────────────────────────

function UsersTab() {
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [actionMsg, setActionMsg] = useState<string | null>(null)

  const { data, loading, error, reload } = useAsyncData(
    () => fetchAdminUsers(search || undefined, roleFilter || undefined),
    [search, roleFilter]
  )
  const users = (data?.users ?? []) as AdminUser[]

  async function doAction(fn: () => Promise<unknown>, msg: string) {
    try {
      await fn()
      setActionMsg(msg)
      reload()
      setTimeout(() => setActionMsg(null), 3000)
    } catch (e) {
      setActionMsg('Error: ' + (e as Error).message)
    }
  }

  return (
    <div>
      {actionMsg && (
        <div style={{ padding: '8px 14px', borderRadius: 8, marginBottom: 12, background: actionMsg.startsWith('Error') ? 'var(--danger)' : 'var(--success)', color: 'white', fontSize: 13 }}>
          {actionMsg}
        </div>
      )}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          placeholder="Search by email or name…" value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: '1 1 200px', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)' }}
        />
        <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)' }}>
          <option value="">All Roles</option>
          <option value="buyer">Buyer</option>
          <option value="designer">Designer</option>
          <option value="producer">Producer</option>
          <option value="admin">Admin</option>
        </select>
        <button className="btn-secondary" onClick={reload} style={{ fontSize: 13 }}>↺ Refresh</button>
      </div>
      {error && <div style={{ color: 'var(--danger)', marginBottom: 12 }}>⚠ {error}</div>}
      {loading ? <div style={{ color: 'var(--text-secondary)' }}>Loading users…</div> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
                <th style={{ padding: '8px 12px' }}>Email</th>
                <th style={{ padding: '8px 12px' }}>Name</th>
                <th style={{ padding: '8px 12px' }}>Role</th>
                <th style={{ padding: '8px 12px' }}>Status</th>
                <th style={{ padding: '8px 12px' }}>Services</th>
                <th style={{ padding: '8px 12px' }}>Joined</th>
                <th style={{ padding: '8px 12px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 12px' }}>{u.email}</td>
                  <td style={{ padding: '8px 12px' }}>{u.firstName} {u.lastName}</td>
                  <td style={{ padding: '8px 12px' }}>
                    <select
                      defaultValue={u.role}
                      onChange={e => doAction(() => updateUserRole(u.id, e.target.value), `Role updated for ${u.email}`)}
                      style={{ padding: '2px 6px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', fontSize: 12 }}
                    >
                      {['buyer', 'designer', 'producer', 'admin'].map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    {u.suspendedUntil ? <span style={{ color: 'var(--danger)' }}>Suspended</span> : <span style={{ color: 'var(--success)' }}>Active</span>}
                    {u.isStaff && <span style={{ marginLeft: 4, fontSize: 11, color: 'var(--primary)' }}>Staff</span>}
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        <input
                          type="checkbox"
                          checked={!!u.deviceNetworkAccess}
                          onChange={e => doAction(
                            () => updateUserServiceAccess(u.id, { deviceNetworkAccess: e.target.checked }),
                            `Device Network ${e.target.checked ? 'enabled' : 'disabled'} for ${u.email}`
                          )}
                        />
                        🖥️ Device Network
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        <input
                          type="checkbox"
                          checked={!!u.propertyPortalAccess}
                          onChange={e => doAction(
                            () => updateUserServiceAccess(u.id, { propertyPortalAccess: e.target.checked }),
                            `Property Portal ${e.target.checked ? 'enabled' : 'disabled'} for ${u.email}`
                          )}
                        />
                        🏠 Property Portal
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        <input
                          type="checkbox"
                          checked={!!u.resumeAccess}
                          onChange={e => doAction(
                            () => updateUserServiceAccess(u.id, { resumeAccess: e.target.checked }),
                            `Resume ${e.target.checked ? 'enabled' : 'disabled'} for ${u.email}`
                          )}
                        />
                        📄 Resume
                      </label>
                    </div>
                  </td>
                  <td style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>{u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '—'}</td>
                  <td style={{ padding: '8px 12px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {!u.verified && (
                        <button className="btn-secondary" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => doAction(() => verifyUser(u.id), `${u.email} verified`)}>
                          ✓ Verify
                        </button>
                      )}
                      {u.suspendedUntil ? (
                        <button className="btn-secondary" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => doAction(() => unsuspendUser(u.id), `${u.email} unsuspended`)}>
                          ↑ Unsuspend
                        </button>
                      ) : (
                        <button style={{ fontSize: 11, padding: '2px 8px', background: 'var(--danger)', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}
                          onClick={() => { const r = prompt('Reason for suspension?'); if (r) doAction(() => suspendUser(u.id, r), `${u.email} suspended`) }}>
                          🚫 Suspend
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {users.length === 0 && <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-secondary)' }}>No users found</div>}
        </div>
      )}
    </div>
  )
}

// ─── Orders Tab ────────────────────────────────────────────────────────────

function OrdersTab() {
  const { data, loading, error } = useAsyncData(() => fetchAdminOrders(), [])
  const orders = data?.orders ?? []
  return (
    <div>
      {error && <div style={{ color: 'var(--danger)', marginBottom: 12 }}>⚠ {error}</div>}
      {loading ? <div style={{ color: 'var(--text-secondary)' }}>Loading orders…</div> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)' }}>
                <th style={{ padding: '8px 12px', textAlign: 'left' }}>Order ID</th>
                <th style={{ padding: '8px 12px', textAlign: 'left' }}>Product</th>
                <th style={{ padding: '8px 12px', textAlign: 'left' }}>Buyer</th>
                <th style={{ padding: '8px 12px', textAlign: 'left' }}>Total</th>
                <th style={{ padding: '8px 12px', textAlign: 'left' }}>Status</th>
                <th style={{ padding: '8px 12px', textAlign: 'left' }}>Date</th>
              </tr>
            </thead>
            <tbody>
              {orders.map(o => (
                <tr key={o.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 12px', color: 'var(--text-secondary)', fontSize: 11 }}>{o.id.slice(0, 12)}…</td>
                  <td style={{ padding: '8px 12px' }}>{o.product?.name ?? '—'}</td>
                  <td style={{ padding: '8px 12px' }}>{o.buyer?.email ?? '—'}</td>
                  <td style={{ padding: '8px 12px' }}>${o.totalAmount?.toFixed(2)}</td>
                  <td style={{ padding: '8px 12px' }}>{o.status}</td>
                  <td style={{ padding: '8px 12px' }}>{new Date(o.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {orders.length === 0 && <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-secondary)' }}>No orders</div>}
        </div>
      )}
    </div>
  )
}

// ─── Disputes Tab ─────────────────────────────────────────────────────────

function DisputesTab() {
  const { data, loading, error, reload } = useAsyncData(() => fetchDisputes(), [])
  const disputes = (data?.disputes ?? []) as Dispute[]

  async function handleResolve(d: Dispute) {
    const resolution = prompt('Resolution note:')
    if (!resolution) return
    try {
      await resolveDispute(d.id, resolution)
      reload()
    } catch (e) {
      alert('Error: ' + (e as Error).message)
    }
  }

  return (
    <div>
      {error && <div style={{ color: 'var(--danger)', marginBottom: 12 }}>⚠ {error}</div>}
      {loading ? <div style={{ color: 'var(--text-secondary)' }}>Loading disputes…</div> : disputes.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-secondary)' }}>No open disputes</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {disputes.map(d => (
            <div key={d.id} style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontWeight: 600 }}>Order {d.orderId?.slice(0, 12)}…</div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>{d.reason}</div>
                  {d.description && <div style={{ fontSize: 12, marginTop: 4 }}>{d.description}</div>}
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 12, padding: '2px 10px', borderRadius: 12, background: d.status === 'open' ? 'var(--danger)' : 'var(--success)', color: 'white' }}>{d.status}</span>
                  {d.status === 'open' && (
                    <button className="btn-primary" style={{ fontSize: 12, padding: '4px 12px' }} onClick={() => handleResolve(d)}>Resolve</button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Settings Tab ─────────────────────────────────────────────────────────

function SettingsTab() {
  const { data, loading } = useAsyncData(() => fetchSiteSettings(), [])
  const [settings, setSettings] = useState<SiteSettings | null>(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  // Populate form once data loads
  if (data && !settings) setSettings(data)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!settings) return
    setSaving(true); setMsg(null)
    try {
      await updateSiteSettings(settings)
      setMsg('Settings saved!')
      setTimeout(() => setMsg(null), 3000)
    } catch (err) {
      setMsg('Error: ' + (err as Error).message)
    } finally { setSaving(false) }
  }

  function field(key: keyof SiteSettings, label: string, suffix = '%') {
    return (
      <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <label style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{label}</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="number" step="0.01" min="0" max="100"
            value={settings?.[key] ?? ''}
            onChange={e => setSettings(s => s ? { ...s, [key]: parseFloat(e.target.value) || 0 } : s)}
            style={{ width: 120, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)' }}
          />
          <span style={{ color: 'var(--text-secondary)' }}>{suffix}</span>
        </div>
      </div>
    )
  }

  if (loading) return <div style={{ color: 'var(--text-secondary)' }}>Loading settings…</div>

  return (
    <form onSubmit={save} style={{ maxWidth: 480, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h3 style={{ margin: '0 0 8px' }}>Platform Fee Settings</h3>
      {msg && <div style={{ padding: '8px 14px', borderRadius: 8, background: msg.startsWith('Error') ? 'var(--danger)' : 'var(--success)', color: 'white', fontSize: 13 }}>{msg}</div>}
      {field('platformFeePercent', 'Platform Fee')}
      {field('paymentUpfrontPercent', 'Upfront Payment')}
      {field('paymentShippingPercent', 'Payment at Shipping')}
      {field('paymentDeliveryPercent', 'Payment at Delivery')}
      {field('postingFeePerRequest', 'Board Posting Fee', '$')}
      {field('salesTaxWithholdingPercent', 'Sales Tax Withholding')}
      {field('messagingFeePercent', 'Messaging Fee')}
      <button type="submit" className="btn-primary" disabled={saving} style={{ alignSelf: 'flex-start', padding: '8px 24px' }}>
        {saving ? 'Saving…' : 'Save Settings'}
      </button>
    </form>
  )
}

// ─── Admin Panel Root ──────────────────────────────────────────────────────

export function AdminPanel() {
  const { user } = useAuth()
  const [tab, setTab] = useState<Tab>('users')

  if (!user || (user.role !== 'admin' && !user.isStaff)) {
    return <Navigate to="/dashboard" replace />
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'users', label: '👥 Users' },
    { key: 'orders', label: '🛒 Orders' },
    { key: 'disputes', label: '⚖️ Disputes' },
    { key: 'settings', label: '⚙️ Settings' },
  ]

  return (
    <div>
      <h2 style={{ marginBottom: 16 }}>🛡️ Admin Panel</h2>
      <StatsBar />

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '2px solid var(--border)', paddingBottom: 0 }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '8px 20px', border: 'none', cursor: 'pointer', borderRadius: '8px 8px 0 0',
            background: tab === t.key ? 'var(--primary)' : 'var(--card-bg)',
            color: tab === t.key ? 'white' : 'var(--text)',
            fontWeight: tab === t.key ? 700 : 400, fontSize: 14,
          }}>{t.label}</button>
        ))}
      </div>

      {tab === 'users' && <UsersTab />}
      {tab === 'orders' && <OrdersTab />}
      {tab === 'disputes' && <DisputesTab />}
      {tab === 'settings' && <SettingsTab />}
    </div>
  )
}
