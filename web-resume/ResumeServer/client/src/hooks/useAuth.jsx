import { createContext, useContext, useState, useEffect } from 'react';
import { api, setToken, clearToken } from '../api-client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = loading

  useEffect(() => {
    const token = localStorage.getItem('rs_token');
    if (!token) { setUser(null); return; }

    // Verify token by attempting to fetch listings — if 401 happens api-client clears it
    api.listings.list()
      .then(() => {
        // Token is valid — decode user from it (it's a JWT, just parse the payload)
        const payload = JSON.parse(atob(token.split('.')[1]));
        setUser({ id: payload.userId, username: payload.username, role: payload.role });
      })
      .catch(() => setUser(null));
  }, []);

  const login = async (username, password) => {
    const data = await api.auth.login(username, password);
    setToken(data.token);
    setUser(data.user);
    return data.user;
  };

  const logout = () => {
    clearToken();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
