import { NavLink } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

function getRegisteredServices(): { designer: boolean; producer: boolean } {
  try {
    const s = JSON.parse(localStorage.getItem('registeredServices') || '{}')
    return { designer: !!s.designer, producer: !!s.producer }
  } catch { return { designer: false, producer: false } }
}

export function DashboardSidebar() {
  const { user } = useAuth()
  const role = user?.role ?? ''
  const svc = getRegisteredServices()

  const isDesigner = role === 'designer' || svc.designer
  const isProducer = role === 'producer' || svc.producer
  const isAdmin = role === 'admin' || user?.isStaff

  return (
    <aside className="dashboard-sidebar">
      {/* General */}
      <div className="dashboard-sidebar-section">
        <nav>
          <NavLink to="/dashboard" end className={({ isActive }) => isActive ? 'active' : ''}>
            📊 Overview
          </NavLink>
          <NavLink to="/dashboard/settings" className={({ isActive }) => isActive ? 'active' : ''}>
            ⚙️ Account Settings
          </NavLink>
          <NavLink to="/dashboard/profile" className={({ isActive }) => isActive ? 'active' : ''}>
            👤 My Profile
          </NavLink>
        </nav>
      </div>

      {/* Buyer */}
      <div className="dashboard-sidebar-section">
        <div className="dashboard-sidebar-label">Buying</div>
        <nav>
          <NavLink to="/dashboard/orders" className={({ isActive }) => isActive ? 'active' : ''}>
            📦 My Orders
          </NavLink>
          <NavLink to="/dashboard/messages" className={({ isActive }) => isActive ? 'active' : ''}>
            💬 Messages
          </NavLink>
        </nav>
      </div>

      {/* Creator sections — shown based on role */}
      {(isDesigner || isProducer) && (
        <div className="dashboard-sidebar-section">
          <div className="dashboard-sidebar-label">Creator</div>
          <nav>
            <NavLink to="/dashboard/listings" className={({ isActive }) => isActive ? 'active' : ''}>
              📋 My Listings
            </NavLink>
            <NavLink to="/dashboard/my-products" className={({ isActive }) => isActive ? 'active' : ''}>
              🛍️ My Products
            </NavLink>
            {isProducer && (
              <NavLink to="/dashboard/queue" className={({ isActive }) => isActive ? 'active' : ''}>
                🏭 Production Queue
              </NavLink>
            )}
            <NavLink to="/dashboard/earnings" className={({ isActive }) => isActive ? 'active' : ''}>
              💰 Earnings
            </NavLink>
          </nav>
        </div>
      )}

      {/* Admin */}
      {isAdmin && (
        <div className="dashboard-sidebar-section">
          <div className="dashboard-sidebar-label">Admin</div>
          <nav>
            <NavLink to="/dashboard/admin" className={({ isActive }) => isActive ? 'active' : ''}>
              🛡️ Admin Panel
            </NavLink>
          </nav>
        </div>
      )}
    </aside>
  )
}
