import { useState } from 'react'

const SERVICE_CATEGORIES = [
  { icon: '🎨', label: 'Painting',        key: 'painting' },
  { icon: '🧱', label: 'Drywall',         key: 'drywall' },
  { icon: '🔧', label: 'Plumbing',        key: 'plumbing' },
  { icon: '❄️', label: 'HVAC',            key: 'hvac' },
  { icon: '⚡', label: 'Electrical',      key: 'electrical' },
  { icon: '🪵', label: 'Woodwork',        key: 'woodwork' },
  { icon: '🏗️', label: 'Concrete',        key: 'concrete' },
  { icon: '🪟', label: 'Windows & Doors', key: 'windows' },
  { icon: '🛁', label: 'Remodeling',      key: 'remodeling' },
  { icon: '🌿', label: 'Landscaping',     key: 'landscaping' },
  { icon: '🧹', label: 'Cleaning',        key: 'cleaning' },
  { icon: '💻', label: 'Software / IT',   key: 'software' },
  { icon: '🚛', label: 'Moving',          key: 'moving' },
  { icon: '🔨', label: 'General Handyman', key: 'handyman' },
  { icon: '🛡️', label: 'Security',        key: 'security' },
  { icon: '📐', label: 'Other',           key: 'other' },
]

export function Services() {
  const [selected, setSelected] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const filtered = SERVICE_CATEGORIES.filter(c =>
    !search.trim() || c.label.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div style={{ padding: 20, maxWidth: 900, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: '0 0 6px', fontSize: 24, fontWeight: 700 }}>Local Services</h2>
        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 14 }}>
          Find skilled local professionals — trades, home services, tech, and more.
        </p>
      </div>

      {/* Search + filter row */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <input
          type="search" placeholder="Search categories…" value={search}
          onChange={e => { setSearch(e.target.value); setSelected(null) }}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', flex: '1 1 200px', minWidth: 140 }}
        />
        {selected && (
          <button
            onClick={() => setSelected(null)}
            style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text)', cursor: 'pointer', fontSize: 13 }}
          >
            ✕ Clear filter
          </button>
        )}
      </div>

      {/* Category grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12, marginBottom: 32 }}>
        {filtered.map(c => (
          <button
            key={c.key}
            onClick={() => setSelected(s => s === c.key ? null : c.key)}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
              padding: '18px 12px', borderRadius: 12, cursor: 'pointer',
              border: selected === c.key ? '2px solid var(--primary)' : '1px solid var(--border)',
              background: selected === c.key ? 'rgba(37,99,235,0.08)' : 'var(--card-bg)',
              color: selected === c.key ? 'var(--primary)' : 'var(--text)',
              fontWeight: selected === c.key ? 700 : 500,
              fontSize: 13, transition: 'all 0.15s',
            }}
          >
            <span style={{ fontSize: 28 }}>{c.icon}</span>
            {c.label}
          </button>
        ))}
      </div>

      {/* Providers area */}
      <div style={{ borderRadius: 12, border: '1px solid var(--border)', padding: 40, textAlign: 'center', background: 'var(--card-bg)' }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>
          {selected ? SERVICE_CATEGORIES.find(c => c.key === selected)?.icon : '🔍'}
        </div>
        <h3 style={{ margin: '0 0 8px', fontSize: 18 }}>
          {selected
            ? `No ${SERVICE_CATEGORIES.find(c => c.key === selected)?.label} providers listed yet`
            : 'Select a category to browse providers'}
        </h3>
        <p style={{ margin: '0 0 20px', color: 'var(--text-secondary)', fontSize: 14 }}>
          {selected
            ? 'Be the first to offer this service in your area.'
            : 'Service providers are local professionals — plumbers, painters, HVAC techs, developers, and more.'}
        </p>
        <button
          className="btn-primary"
          style={{ padding: '10px 24px', fontSize: 14 }}
          onClick={() => alert('Service provider registration coming soon!')}
        >
          Register as a Service Provider
        </button>
      </div>
    </div>
  )
}

