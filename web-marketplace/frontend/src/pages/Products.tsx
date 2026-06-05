import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAsyncData } from '../hooks/useAsyncData'
import { fetchProducts } from '../api/search'
import { ProductCard } from '../components/cards/ProductCard'
import { useUserLocation, haversineKm } from '../hooks/useUserLocation'

// Products excludes 'gizmos' — those have their own dedicated page (/gizmos)
const CATEGORIES = ['All', 'Ceramics', 'Furniture', 'Textiles', 'Jewelry', 'Art', 'Home Goods', 'Apparel', 'Food', 'Software', 'Other']
const SORT_OPTIONS = [
  { value: 'nearest', label: 'Nearest' },
  { value: 'rating', label: 'Top Rated' },
  { value: 'price_asc', label: 'Price: Low → High' },
  { value: 'price_desc', label: 'Price: High → Low' },
  { value: 'newest', label: 'Newest' },
]
const PAGE_SIZE = 12

export function Products() {
  const [category, setCategory] = useState('All')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('nearest')
  const [page, setPage] = useState(1)

  const userLocation = useUserLocation()
  const { data, loading, error } = useAsyncData(() => fetchProducts({ limit: 200 }), [])

  const filtered = useMemo(() => {
    let list = data?.results ?? []
    if (category !== 'All') list = list.filter(p => (p.category ?? '').toLowerCase().includes(category.toLowerCase()))
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(p => p.name.toLowerCase().includes(q) || (p.description ?? '').toLowerCase().includes(q))
    }
    if (sort === 'nearest' && userLocation) {
      list = [...list].sort((a, b) => {
        const da = a.designerLatitude && a.designerLongitude ? haversineKm(userLocation.lat, userLocation.lng, Number(a.designerLatitude), Number(a.designerLongitude)) : Infinity
        const db = b.designerLatitude && b.designerLongitude ? haversineKm(userLocation.lat, userLocation.lng, Number(b.designerLatitude), Number(b.designerLongitude)) : Infinity
        return da - db
      })
    } else if (sort === 'rating') list = [...list].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
    else if (sort === 'price_asc') list = [...list].sort((a, b) => (a.basePrice ?? 0) - (b.basePrice ?? 0))
    else if (sort === 'price_desc') list = [...list].sort((a, b) => (b.basePrice ?? 0) - (a.basePrice ?? 0))
    return list
  }, [data, category, search, sort, userLocation])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const handleSearch = (v: string) => { setSearch(v); setPage(1) }
  const handleCategory = (v: string) => { setCategory(v); setPage(1) }

  return (
    <div style={{ padding: 16 }}>
      {/* Gizmos callout — maker hardware has its own dedicated page */}
      <Link to="/gizmos" style={{ textDecoration: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 10, marginBottom: 20, cursor: 'pointer' }}>
          <span style={{ fontSize: 28 }}>🔧</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, color: 'var(--text)' }}>Looking for Gizmos?</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>DIY electronics, IoT devices, robotics kits, and maker hardware have their own section →</div>
          </div>
        </div>
      </Link>

      {/* Search + sort bar */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <input
          type="search"
          placeholder="Search products…"
          value={search}
          onChange={e => handleSearch(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', flex: '1 1 200px' }}
        />
        <select value={sort} onChange={e => setSort(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)' }}>
          {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <span style={{ color: 'var(--text-secondary)', fontSize: 13, alignSelf: 'center' }}>
          {loading ? 'Loading…' : `${filtered.length} product${filtered.length !== 1 ? 's' : ''}`}
        </span>
      </div>

      {/* Category chips */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        {CATEGORIES.map(c => (
          <button key={c} onClick={() => handleCategory(c)}
            style={{ padding: '4px 14px', borderRadius: 20, border: '1px solid var(--border)', background: category === c ? 'var(--accent)' : 'var(--card-bg)', color: category === c ? '#fff' : 'var(--text)', cursor: 'pointer', fontSize: 13 }}>
            {c}
          </button>
        ))}
      </div>

      {error && <div style={{ color: 'var(--danger)', marginBottom: 16 }}>⚠ {error}</div>}

      {/* Grid */}
      {!loading && pageItems.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-secondary)' }}>No products found</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
          {loading
            ? Array.from({ length: PAGE_SIZE }).map((_, i) => (
                <div key={i} style={{ height: 280, background: 'var(--card-bg)', borderRadius: 12, border: '1px solid var(--border)' }} />
              ))
            : pageItems.map(p => <ProductCard key={p.id} product={p} />)}
        </div>
      )}

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 32 }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text)', cursor: page === 1 ? 'not-allowed' : 'pointer' }}>
            ← Prev
          </button>
          <span style={{ padding: '6px 12px', color: 'var(--text-secondary)', fontSize: 13 }}>{page} / {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text)', cursor: page === totalPages ? 'not-allowed' : 'pointer' }}>
            Next →
          </button>
        </div>
      )}
    </div>
  )
}
