import { Outlet, Link } from 'react-router-dom'
import { TopNav } from './TopNav'
import { DashboardSidebar } from './DashboardSidebar'

export function DashboardLayout() {
  return (
    <div className="dashboard-layout">
      <TopNav />
      <div className="dashboard-body">
        <DashboardSidebar />
        <main className="dashboard-content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
