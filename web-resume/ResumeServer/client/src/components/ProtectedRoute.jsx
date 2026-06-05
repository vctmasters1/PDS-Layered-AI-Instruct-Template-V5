import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.jsx';

export default function ProtectedRoute({ children, requireAdmin = false }) {
  const { user } = useAuth();

  if (user === undefined) {
    return <div style={{ padding: 40, textAlign: 'center' }}><span className="spinner" /></div>;
  }

  if (!user) return <Navigate to="/login" replace />;
  if (requireAdmin && user.role !== 'admin') return <Navigate to="/" replace />;

  return children;
}
