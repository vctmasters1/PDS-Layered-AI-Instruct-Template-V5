import { useAuth } from '../../context/AuthContext'
import { useAsyncData } from '../../hooks/useAsyncData'
import { fetchMyOrders } from '../../api/orders'
import { fetchNotifications } from '../../api/notifications'

function StatCard({ label, value, icon }: { label: string; value: string | number; icon: string }) {
  return (
    <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, minWidth: 140 }}>
      <div style={{ fontSize: 28 }}>{icon}</div>
      <div style={{ fontSize: 24, fontWeight: 700, margin: '8px 0 4px' }}>{value}</div>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{label}</div>
    </div>
  )
}

export function Dashboard() {
  const { user } = useAuth()
  const orders = useAsyncData(() => fetchMyOrders(), [])
  const notifications = useAsyncData(() => fetchNotifications(), [])

  const orderList = orders.data?.orders ?? []
  const notifList = notifications.data?.notifications ?? []
  const unread = notifList.filter(n => !n.read).length

  const activeOrders = orderList.filter(o => !['delivered', 'cancelled', 'refunded'].includes(o.status)).length
  const completedOrders = orderList.filter(o => o.status === 'delivered').length

  const greeting = user?.firstName ? `Welcome back, ${user.firstName}!` : 'Welcome back!'

  return (
    <div>
      <h2 style={{ marginBottom: 4 }}>{greeting}</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 24 }}>
        {user?.role ? `You are logged in as ${user.role}` : ''}
        {user?.isStaff ? ' · Staff' : ''}
      </p>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 32 }}>
        <StatCard icon="📦" label="Active Orders" value={orders.loading ? '…' : activeOrders} />
        <StatCard icon="✅" label="Completed" value={orders.loading ? '…' : completedOrders} />
        <StatCard icon="🔔" label="Unread Notifications" value={notifications.loading ? '…' : unread} />
      </div>

      {/* Recent orders */}
      <h3 style={{ marginBottom: 12 }}>Recent Orders</h3>
      {orders.error && <div style={{ color: 'var(--danger)' }}>⚠ {orders.error}</div>}
      {orders.loading ? (
        <div style={{ color: 'var(--text-secondary)' }}>Loading orders…</div>
      ) : orderList.length === 0 ? (
        <div style={{ color: 'var(--text-secondary)' }}>No orders yet. <a href="/">Start browsing!</a></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {orderList.slice(0, 5).map(o => (
            <div key={o.id} style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{o.product?.name ?? 'Order ' + o.id.slice(0, 8)}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{new Date(o.createdAt).toLocaleDateString()}</div>
              </div>
              <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                <span style={{ fontSize: 13 }}>${o.totalAmount?.toFixed(2)}</span>
                <span style={{ fontSize: 12, padding: '2px 10px', borderRadius: 12, background: o.status === 'delivered' ? 'var(--success)' : 'var(--primary)', color: 'white' }}>{o.status}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Notifications */}
      {unread > 0 && (
        <>
          <h3 style={{ margin: '24px 0 12px' }}>Notifications ({unread} unread)</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {notifList.filter(n => !n.read).slice(0, 5).map(n => (
              <div key={n.id} style={{ background: 'var(--card-bg)', border: '1px solid var(--primary)', borderRadius: 8, padding: '10px 16px', fontSize: 14 }}>
                {n.message}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
