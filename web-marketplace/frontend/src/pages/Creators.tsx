import { useState, useMemo } from 'react'
import { useAsyncData } from '../hooks/useAsyncData'
import { useUserLocation, haversineKm } from '../hooks/useUserLocation'
import { fetchDesigners, fetchProducers } from '../api/search'
import { DesignerCard, ProducerCard } from '../components/cards/CreatorCard'

type Tab = 'designers' | 'producers'
type SortBy = 'distance' | 'rating' | 'name'

export function Creators() {
  const [tab, setTab] = useState<Tab>('designers')
  const [search, setSearch] = useState('')
  const [availability, setAvailability] = useState('')
  const [stateFilter, setStateFilter] = useState('')
  const [sortBy, setSortBy] = useState<SortBy>('distance')

  const userLocation = useUserLocation()

  const designers = useAsyncData(() => fetchDesigners({ limit: 200 }), [])
  const producers = useAsyncData(() => fetchProducers({ limit: 200 }), [])

  // Unique state list for the filter dropdown
  const designerStates = useMemo(() => {
    const states = [...new Set((designers.data?.results ?? []).map(d => d.state).filter(Boolean))] as string[]
    return states.sort()
  }, [designers.data])

  const producerStates = useMemo(() => {
    const states = [...new Set((producers.data?.results ?? []).map(p => p.state).filter(Boolean))] as string[]
    return states.sort()
  }, [producers.data])

  const filteredDesigners = useMemo(() => {
    let list = designers.data?.results ?? []
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(d =>
        d.name.toLowerCase().includes(q) ||
        (d.specialties ?? '').toLowerCase().includes(q) ||
        (d.bio ?? '').toLowerCase().includes(q) ||
        (d.city ?? '').toLowerCase().includes(q) ||
        (d.state ?? '').toLowerCase().includes(q)
      )
    }
    if (availability) list = list.filter(d => d.availability === availability)
    if (stateFilter) list = list.filter(d => d.state === stateFilter)
    if (sortBy === 'distance' && userLocation) {
      list = [...list].sort((a, b) => {
        const da = a.latitude && a.longitude ? haversineKm(userLocation.lat, userLocation.lng, a.latitude, a.longitude) : Infinity
        const db = b.latitude && b.longitude ? haversineKm(userLocation.lat, userLocation.lng, b.latitude, b.longitude) : Infinity
        return da - db
      })
    } else if (sortBy === 'rating') {
      list = [...list].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
    } else if (sortBy === 'name') {
      list = [...list].sort((a, b) => a.name.localeCompare(b.name))
    }
    return list
  }, [designers.data, search, availability, stateFilter, sortBy, userLocation])

  const filteredProducers = useMemo(() => {
    let list = producers.data?.results ?? []
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.capabilities ?? '').toLowerCase().includes(q) ||
        (p.bio ?? '').toLowerCase().includes(q) ||
        (p.city ?? '').toLowerCase().includes(q) ||
        (p.state ?? '').toLowerCase().includes(q)
      )
    }
    if (availability) list = list.filter(p => p.availability === availability)
    if (stateFilter) list = list.filter(p => p.state === stateFilter)
    if (sortBy === 'distance' && userLocation) {
      list = [...list].sort((a, b) => {
        const da = a.latitude && a.longitude ? haversineKm(userLocation.lat, userLocation.lng, a.latitude, a.longitude) : Infinity
        const db = b.latitude && b.longitude ? haversineKm(userLocation.lat, userLocation.lng, b.latitude, b.longitude) : Infinity
        return da - db
      })
    } else if (sortBy === 'rating') {
      list = [...list].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
    } else if (sortBy === 'name') {
      list = [...list].sort((a, b) => a.name.localeCompare(b.name))
    }
    return list
  }, [producers.data, search, availability, stateFilter, sortBy, userLocation])

  const isLoading = tab === 'designers' ? designers.loading : producers.loading
  const error = tab === 'designers' ? designers.error : producers.error
  const count = tab === 'designers' ? filteredDesigners.length : filteredProducers.length
  const activeStates = tab === 'designers' ? designerStates : producerStates

  const tabStyle = (t: Tab) => ({
    padding: '8px 20px', borderRadius: '8px 8px 0 0', border: 'none', cursor: 'pointer',
    background: tab === t ? 'var(--primary)' : 'var(--card-bg)',
    color: tab === t ? 'white' : 'var(--text)', fontWeight: 600,
  })

  const SELECT_STYLE: React.CSSProperties = {
    padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)',
    background: 'var(--input-bg)', color: 'var(--text)',
  }

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
        <button style={tabStyle('designers')} onClick={() => { setTab('designers'); setStateFilter('') }}>🎨 Designers</button>
        <button style={tabStyle('producers')} onClick={() => { setTab('producers'); setStateFilter('') }}>🏭 Producers</button>
      </div>

      {/* Filter row */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
        <input
          type="search" placeholder={`Search ${tab}…`} value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ ...SELECT_STYLE, flex: '1 1 180px', minWidth: 140 }}
        />
        <select value={stateFilter} onChange={e => setStateFilter(e.target.value)} style={SELECT_STYLE}>
          <option value="">All States</option>
          {activeStates.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={availability} onChange={e => setAvailability(e.target.value)} style={SELECT_STYLE}>
          <option value="">All Availability</option>
          <option value="available">🟢 Available</option>
          <option value="busy">🟡 Busy</option>
          <option value="waitlist_only">🟡 Waitlist</option>
        </select>
        <select value={sortBy} onChange={e => setSortBy(e.target.value as SortBy)} style={SELECT_STYLE}>
          <option value="distance">📍 Nearest First</option>
          <option value="rating">⭐ Top Rated</option>
          <option value="name">🔤 Name A–Z</option>
        </select>
        <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
          {isLoading ? 'Loading…' : `${count} ${tab}`}
        </span>
      </div>

      {error && <div style={{ color: 'var(--danger)', marginBottom: 16 }}>⚠ {error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
        {isLoading
          ? Array.from({ length: 6 }).map((_, i) => (
              <div key={i} style={{ height: 240, background: 'var(--card-bg)', borderRadius: 12, border: '1px solid var(--border)' }} />
            ))
          : tab === 'designers'
            ? filteredDesigners.map(d => <DesignerCard key={d.id} designer={d} />)
            : filteredProducers.map(p => <ProducerCard key={p.id} producer={p} />)
        }
      </div>

      {!isLoading && count === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-secondary)' }}>
          No {tab} found{stateFilter ? ` in ${stateFilter}` : ''}{search ? ` matching "${search}"` : ''}
        </div>
      )}
    </div>
  )
}
