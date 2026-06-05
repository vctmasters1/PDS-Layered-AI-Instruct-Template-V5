import { useAsyncData } from '../../hooks/useAsyncData'
import { fetchMyOrders } from '../../api/orders'

const STATUS_COLORS: Record<string, string> = {
  pending: 'var(--warning)',
  confirmed: 'var(--primary)',
  in_production: 'var(--primary)',
  shipped: '#9b59b6',
  delivered: 'var(--success)',
  cancelled: 'var(--danger)',
  refunded: 'var(--text-secondary)',
}

export function Orders() {
  const { data, loading, error, reload } = useAsyncData(() => fetchMyOrders(), [])
  const orders = data?.orders ?? []

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ margin: 0 }}>My Orders</h2>
        <button className="btn-secondary" onClick={reload} style={{ fontSize: 13 }}>↺ Refresh</button>
      </div>

      {error && <div style={{ color: 'var(--danger)', marginBottom: 12 }}>⚠ {error}</div>}

      {loading ? (
        <div style={{ color: 'var(--text-secondary)' }}>Loading orders…</div>
      ) : orders.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-secondary)' }}>
          <p>No orders yet.</p>
          <a href="/" className="btn-primary" style={{ display: 'inline-block', marginTop: 12 }}>Browse Products</a>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {orders.map(o => (
            <div key={o.id} style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{o.product?.name ?? 'Order'}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                    #{o.id.slice(0, 12)} · {new Date(o.createdAt).toLocaleDateString()}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <span style={{ fontWeight: 700 }}>${o.totalAmount?.toFixed(2)}</span>
                  <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 12, background: STATUS_COLORS[o.status] ?? 'var(--primary)', color: 'white' }}>
                    {o.status.replace('_', ' ')}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
