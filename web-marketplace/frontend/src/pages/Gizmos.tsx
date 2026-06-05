// Gizmos — DIY electronics, IoT devices, robotics kits, and maker hardware
// category=gizmos in the DB (originally its own top-level tab in the vanilla app)
import { useState, useMemo } from 'react'
import { useAsyncData } from '../hooks/useAsyncData'
import { fetchProducts } from '../api/search'
import { ProductCard } from '../components/cards/ProductCard'

const GIZMO_FILTERS = ['All Gizmos', 'IoT & Sensors', 'Robotics', 'Electronics', 'Kits', 'Enclosures', 'Wearables', 'Other']

export function Gizmos() {
  const [filter, setFilter] = useState('All Gizmos')
  const [search, setSearch] = useState('')

  const { data, loading, error } = useAsyncData(
    () => fetchProducts({ category: 'gizmos', limit: 200 }),
    []
  )

  const filtered = useMemo(() => {
    let list = data?.results ?? []
    if (filter !== 'All Gizmos') {
      list = list.filter(p => (p.category ?? '').toLowerCase().includes(filter.toLowerCase()))
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(p => p.name.toLowerCase().includes(q) || (p.description ?? '').toLowerCase().includes(q))
    }
    return list
  }, [data, filter, search])

  return (
    <div style={{ padding: 16 }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 22, display: 'flex', alignItems: 'center', gap: 10 }}>
          🔧 Gizmos
        </h2>
        <p style={{ margin: '6px 0 0', color: 'var(--text-secondary)', fontSize: 14 }}>
          DIY electronics, IoT devices, robotics kits, and maker hardware from local creators.
        </p>
      </div>

      {/* Search + count */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <input
          type="search"
          placeholder="Search gizmos…"
          value={search}
          onChange={e => { setSearch(e.target.value) }}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', flex: '1 1 200px' }}
        />
        <span style={{ color: 'var(--text-secondary)', fontSize: 13, alignSelf: 'center' }}>
          {loading ? 'Loading…' : `${filtered.length} gizmo${filtered.length !== 1 ? 's' : ''}`}
        </span>
      </div>

      {/* Filter chips */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        {GIZMO_FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ padding: '4px 14px', borderRadius: 20, border: '1px solid var(--border)', background: filter === f ? 'var(--accent)' : 'var(--card-bg)', color: filter === f ? '#fff' : 'var(--text)', cursor: 'pointer', fontSize: 13 }}>
            {f}
          </button>
        ))}
      </div>

      {error && <div style={{ color: 'var(--danger)', marginBottom: 16 }}>⚠ {error}</div>}

      {/* Grid */}
      {!loading && filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔧</div>
          <h3 style={{ margin: '0 0 8px', color: 'var(--text)' }}>No Gizmos Listed Yet</h3>
          <p style={{ color: 'var(--text-secondary)', maxWidth: 400, margin: '0 auto' }}>
            DIY electronics, IoT devices, robotics kits, and maker hardware will appear here.
            Designers and producers can list gizmos from their dashboard.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
          {loading
            ? Array.from({ length: 6 }).map((_, i) => (
                <div key={i} style={{ height: 280, background: 'var(--card-bg)', borderRadius: 12, border: '1px solid var(--border)' }} />
              ))
            : filtered.map(p => <ProductCard key={p.id} product={p} />)}
        </div>
      )}
    </div>
  )
}
