import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { BrowseLayout } from './components/layout/BrowseLayout'
import { DashboardLayout } from './components/layout/DashboardLayout'
import { Products } from './pages/Products'
import { Gizmos } from './pages/Gizmos'
import { Services } from './pages/Services'
import { Materials } from './pages/Materials'
import { Creators } from './pages/Creators'
import { Board } from './pages/Board'
import { MapPage } from './pages/MapPage'
import { Dashboard } from './pages/dashboard/Dashboard'
import { AccountSettings } from './pages/dashboard/AccountSettings'
import { Orders } from './pages/dashboard/Orders'
import { MessagingPage } from './messaging'
import { AdminPanel } from './pages/dashboard/admin/AdminPanel'
import { ProfilePage } from './pages/dashboard/ProfilePage'
import { MyProductsPage } from './pages/dashboard/MyProductsPage'
import { CreatorProfilePage } from './pages/CreatorProfilePage'

// BASE_URL comes from Vite's base config (BASE_PATH env var on Railway, e.g. /marketplace/)
const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || ''

export function App() {
  return (
    <BrowserRouter basename={basename}>
      <AuthProvider>
        <Routes>
          {/* Browse context — top nav + mobile bottom tab bar */}
          <Route element={<BrowseLayout />}>
            <Route index element={<Navigate to="/products" replace />} />
            <Route path="products" element={<Products />} />
            <Route path="gizmos" element={<Gizmos />} />
            <Route path="services" element={<Services />} />
            <Route path="materials" element={<Materials />} />
            <Route path="creators" element={<Creators />} />
            <Route path="creators/:type/:id" element={<CreatorProfilePage />} />
            <Route path="board" element={<Board />} />
            <Route path="map" element={<MapPage />} />
          </Route>

          {/* Dashboard context — sidebar layout, no bottom nav */}
          <Route path="dashboard" element={<DashboardLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="settings" element={<AccountSettings />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="my-products" element={<MyProductsPage />} />
            <Route path="orders" element={<Orders />} />
            <Route path="messages" element={<MessagingPage />} />
            <Route path="admin" element={<AdminPanel />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
