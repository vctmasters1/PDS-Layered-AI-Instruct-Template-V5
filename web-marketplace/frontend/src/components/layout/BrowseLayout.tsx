import { Outlet } from 'react-router-dom'
import { TopNav } from './TopNav'
import { BottomNav } from './BottomNav'

export function BrowseLayout() {
  return (
    <div className="browse-layout">
      <TopNav />
      <main className="browse-content">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  )
}
