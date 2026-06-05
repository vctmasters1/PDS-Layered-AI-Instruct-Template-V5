import { NavLink, useNavigate } from 'react-router-dom'
import { useState } from 'react'

// 5 primary items — Miller's Law cap for mobile (see AI-INSTRUCT § Layout and Navigation)
// Materials, Board, Map live under More overflow
const PRIMARY_ITEMS = [
  { to: '/products', label: 'Products', icon: '🛍️', end: false },
  { to: '/gizmos', label: 'Gizmos', icon: '🔧', end: false },
  { to: '/services', label: 'Services', icon: '⚙️', end: false },
  { to: '/creators', label: 'Creators', icon: '👤', end: false },
]

const MORE_ITEMS = [
  { to: '/materials', label: 'Materials', icon: '🧱' },
  { to: '/board', label: 'Board', icon: '📋' },
  { to: '/map', label: 'Map', icon: '🗺️' },
]

export function BottomNav() {
  const [moreOpen, setMoreOpen] = useState(false)
  const navigate = useNavigate()

  return (
    <nav className="bottom-nav">
      {PRIMARY_ITEMS.map(item => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) => `bottom-nav-item${isActive ? ' active' : ''}`}
        >
          <span className="bottom-nav-icon">{item.icon}</span>
          {item.label}
        </NavLink>
      ))}

      {/* More button — opens overflow menu */}
      <button
        className={`bottom-nav-item${moreOpen ? ' active' : ''}`}
        onClick={() => setMoreOpen(o => !o)}
        aria-label="More sections"
      >
        <span className="bottom-nav-icon">⋯</span>
        More
      </button>

      {/* More overflow sheet */}
      {moreOpen && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 999 }}
            onClick={() => setMoreOpen(false)}
          />
          <div style={{
            position: 'fixed',
            bottom: 64,
            right: 0,
            left: 0,
            background: 'var(--bg-primary, #fff)',
            borderTop: '1px solid var(--border-color, #e5e7eb)',
            borderRadius: '16px 16px 0 0',
            padding: '12px 16px',
            zIndex: 1000,
            display: 'flex',
            gap: 8,
          }}>
            {MORE_ITEMS.map(item => (
              <button
                key={item.to}
                className="bottom-nav-item"
                style={{ flex: 1 }}
                onClick={() => {
                  setMoreOpen(false)
                  navigate(item.to)
                }}
              >
                <span className="bottom-nav-icon">{item.icon}</span>
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </nav>
  )
}
