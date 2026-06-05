import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Nav from './components/Nav.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Workspace from './pages/Workspace.jsx';
import Sources from './pages/Sources.jsx';
import Admin from './pages/Admin.jsx';
import Insight from './pages/Insight.jsx';
import AiChat from './pages/AiChat.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Nav />
        <div className="app-body">
          <main className="main-content">
            <Routes>
              <Route path="/login" element={<Login />} />

              <Route path="/" element={
                <ProtectedRoute><Dashboard /></ProtectedRoute>
              } />
              <Route path="/workspace/:listingId" element={
                <ProtectedRoute><Workspace /></ProtectedRoute>
              } />
              <Route path="/sources" element={
                <ProtectedRoute><Sources /></ProtectedRoute>
              } />
              <Route path="/insight" element={
                <ProtectedRoute><Insight /></ProtectedRoute>
              } />
              <Route path="/ai-chat" element={
                <ProtectedRoute><AiChat /></ProtectedRoute>
              } />
              <Route path="/admin" element={
                <ProtectedRoute requireAdmin><Admin /></ProtectedRoute>
              } />

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
        </div>
      </AuthProvider>
    </BrowserRouter>
  );
}
