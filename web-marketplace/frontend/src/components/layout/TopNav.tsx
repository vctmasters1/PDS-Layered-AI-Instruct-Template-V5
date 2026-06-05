import { useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { AuthModal } from '../auth/AuthModal'

type AuthMode = 'login' | 'register'

function toggleTheme() {
  const isDark = document.documentElement.classList.toggle('dark-mode')
  try {
    localStorage.setItem('pds-theme', isDark ? 'dark' : 'light')
  } catch {}
}

export function TopNav() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [authModal, setAuthModal] = useState<AuthMode | null>(null)
  const [userMenuOpen, setUserMenuOpen] = useState(false)

  const handleLogout = async () => {
    setUserMenuOpen(false)
    await logout()
    navigate('/')
  }

  const displayName = user ? (`${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email) : ''

  return (
    <>
      {/* ── PDS Suite Bar — brand + links gated on access ── */}
      <div style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)', fontSize: '12px', zIndex: 100 }}>
        <div className="container" style={{ display: 'flex', alignItems: 'center', padding: '5px 0', gap: 0 }}>
          <a href="/marketplace/" style={{ fontWeight: 700, color: 'var(--text-primary)', marginRight: 20, textDecoration: 'none', fontSize: 13, letterSpacing: '-0.01em' }}>
            PipeDream Systems
          </a>
          <a href="/marketplace/" style={{ color: '#2563eb', fontWeight: 600, textDecoration: 'none', padding: '2px 8px', borderRadius: 4, background: 'rgba(37,99,235,0.1)' }}>Marketplace</a>
          {user?.deviceNetworkAccess && (
            <>
              <span style={{ color: 'var(--border)', margin: '0 6px' }}>|</span>
              <a href="/hmi/" style={{ color: 'var(--text-secondary)', textDecoration: 'none', padding: '2px 8px' }}>Device Network</a>
            </>
          )}
          {user?.propertyPortalAccess && (
            <>
              <span style={{ color: 'var(--border)', margin: '0 6px' }}>|</span>
              <a href="/property/" style={{ color: 'var(--text-secondary)', textDecoration: 'none', padding: '2px 8px' }}>Property Portal</a>
            </>
          )}
          {user?.resumeAccess && (
            <>
              <span style={{ color: 'var(--border)', margin: '0 6px' }}>|</span>
              <a href="/resume/" style={{ color: 'var(--text-secondary)', textDecoration: 'none', padding: '2px 8px' }}>Resume Suite</a>
            </>
          )}
        </div>
      </div>

      <nav id="mainNavbar" className="navbar">
        <div className="container" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Logo */}
          <div className="logo">
            <Link to="/" style={{ textDecoration: 'none', color: 'inherit' }}>
              <h1>Marketplace</h1>
            </Link>
          </div>

          {/* Desktop section nav (hidden on mobile — see shell.css) */}
          <nav className="navbar-section-links">
            <NavLink to="/products" className={({ isActive }) => isActive ? 'active' : ''}>Products</NavLink>
            <NavLink to="/gizmos" className={({ isActive }) => isActive ? 'active' : ''}>Gizmos</NavLink>
            <NavLink to="/services" className={({ isActive }) => isActive ? 'active' : ''}>Services</NavLink>
            <NavLink to="/materials" className={({ isActive }) => isActive ? 'active' : ''}>Materials</NavLink>
            <NavLink to="/creators" className={({ isActive }) => isActive ? 'active' : ''}>Creators</NavLink>
            <NavLink to="/board" className={({ isActive }) => isActive ? 'active' : ''}>Board</NavLink>
            <NavLink to="/map" className={({ isActive }) => isActive ? 'active' : ''}>Map</NavLink>
          </nav>

          {/* Controls */}
          <div className="nav-links" style={{ marginLeft: 'auto' }}>
            <button
              className="theme-toggle"
              onClick={toggleTheme}
              title="Toggle dark/light mode"
            >
              🌙
            </button>

            {user ? (
              <div className="user-menu" style={{ position: 'relative' }}>
                <button
                  className="user-profile-btn"
                  onClick={() => setUserMenuOpen(o => !o)}
                >
                  {displayName} ▼
                </button>
                {userMenuOpen && (
                  <div className="user-dropdown" style={{ display: 'block' }}>
                    <Link to="/dashboard" onClick={() => setUserMenuOpen(false)}>📊 Dashboard</Link>
                    <Link to="/dashboard/profile" onClick={() => setUserMenuOpen(false)}>👤 My Profile</Link>
                    <Link to="/dashboard/my-products" onClick={() => setUserMenuOpen(false)}>🛍️ My Products</Link>
                    <Link to="/dashboard/orders" onClick={() => setUserMenuOpen(false)}>📦 My Orders</Link>
                    <Link to="/dashboard/messages" onClick={() => setUserMenuOpen(false)}>💬 Messages</Link>
                    <Link to="/dashboard/settings" onClick={() => setUserMenuOpen(false)}>⚙️ Account Settings</Link>
                    {(user.role === 'admin' || user.isStaff) && (
                      <Link to="/dashboard/admin" onClick={() => setUserMenuOpen(false)}>🛡️ Admin</Link>
                    )}

                    {/* ── PDS Services ── */}
                    <div className="user-dropdown-section-label">PDS Services</div>
                    {user.deviceNetworkAccess
                      ? <a href="/hmi/" onClick={() => setUserMenuOpen(false)}>🖥️ Device Network</a>
                      : <Link to="/dashboard/services#device-network" onClick={() => setUserMenuOpen(false)} style={{ opacity: 0.6 }}>🖥️ Device Network <span style={{ fontSize: '10px', background: 'var(--accent)', color: '#fff', borderRadius: 3, padding: '1px 5px', marginLeft: 4 }}>Upgrade</span></Link>
                    }
                    {user.propertyPortalAccess
                      ? <a href="/property/" onClick={() => setUserMenuOpen(false)}>🏠 Property Portal</a>
                      : <Link to="/dashboard/services#property-portal" onClick={() => setUserMenuOpen(false)} style={{ opacity: 0.6 }}>🏠 Property Portal <span style={{ fontSize: '10px', background: 'var(--accent)', color: '#fff', borderRadius: 3, padding: '1px 5px', marginLeft: 4 }}>Upgrade</span></Link>
                    }
                    {user.resumeAccess
                      ? <a href="/resume/" onClick={() => setUserMenuOpen(false)}>📄 Resume Suite</a>
                      : <Link to="/dashboard/services#resume" onClick={() => setUserMenuOpen(false)} style={{ opacity: 0.6 }}>📄 Resume Suite <span style={{ fontSize: '10px', background: 'var(--accent)', color: '#fff', borderRadius: 3, padding: '1px 5px', marginLeft: 4 }}>Upgrade</span></Link>
                    }

                    <button
                      onClick={handleLogout}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '8px 16px', width: '100%', textAlign: 'left' }}
                    >
                      🚪 Sign Out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="auth-buttons">
                <button className="btn-secondary" onClick={() => setAuthModal('login')}>Sign In</button>
                <button className="btn-primary" onClick={() => setAuthModal('register')}>Sign Up</button>
              </div>
            )}
          </div>
        </div>
      </nav>

      {authModal && (
        <AuthModal mode={authModal} onClose={() => setAuthModal(null)} />
      )}
    </>
  )
}
