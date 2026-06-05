// ============================================================================
// Authentication Service - Handles user login, registration, token management
// ============================================================================

const API_BASE = (import.meta.env.VITE_API_BASE || "") + "/v1";

class AuthService {
    constructor() {
        this.user = null;
        this.token = null;
        this.loadFromStorage();
    }

    /**
     * Alias for this.user — some modules reference authService.currentUser
     */
    get currentUser() {
        return this.user;
    }
    set currentUser(val) {
        this.user = val;
    }

    /**
     * Load user from localStorage (token is httpOnly cookie — not stored here)
     */
    loadFromStorage() {
        try {
            const storedUser = localStorage.getItem('pds_user');

            if (storedUser) {
                this.user = JSON.parse(storedUser);
            }
        } catch (error) {
            console.error('Error loading from storage:', error);
            this.clearStorage();
        }
    }

    /**
     * Save user to localStorage (token is httpOnly cookie — not stored here)
     */
    saveToStorage() {
        if (this.user) {
            localStorage.setItem('pds_user', JSON.stringify(this.user));
        }
    }

    /**
     * Clear stored auth data
     */
    clearStorage() {
        localStorage.removeItem('pds_user');
        localStorage.removeItem('pds_token');
        this.user = null;
        this.token = null;
    }

    /**
     * Register new user account
     * @param {Object} data - Registration data {email, password, firstName, lastName, roles}
     * @returns {Promise<Object>} User and token
     */
    async register(data) {
        try {
            const response = await fetch(`${API_BASE}/auth/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify(data)
            });

            const result = await response.json();

            if (!response.ok) {
                const msg = result.details ? result.details.join('; ') : (result.error || 'Registration failed');
                throw new Error(msg);
            }

            this.user = result.user;
            this.saveToStorage();

            return result;
        } catch (error) {
            console.error('Registration error:', error);
            throw error;
        }
    }

    /**
     * Login user
     * @param {string} email - User email
     * @param {string} password - User password
     * @returns {Promise<Object>} User and token
     */
    async login(email, password) {
        try {
            const response = await fetch(`${API_BASE}/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify({ email, password })
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Login failed');
            }

            this.user = result.user;
            this.saveToStorage();

            return result;
        } catch (error) {
            console.error('Login error:', error);
            throw error;
        }
    }

    /**
     * Get current user profile from server
     * @returns {Promise<Object>} User profile
     */
    async getProfile() {
        if (!this.user) {
            throw new Error('Not authenticated');
        }

        try {
            const response = await fetch(`${API_BASE}/auth/me`, {
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
            });

            if (!response.ok) {
                if (response.status === 401) {
                    this.clearStorage();
                }
                throw new Error('Failed to fetch profile');
            }

            const result = await response.json();
            this.user = result.user;
            this.saveToStorage();

            return result.user;
        } catch (error) {
            console.error('Profile fetch error:', error);
            throw error;
        }
    }

    /**
     * Update user profile
     * @param {Object} data - Data to update {firstName, lastName, phone}
     * @returns {Promise<Object>} Updated user
     */
    async updateProfile(data) {
        if (!this.user) {
            throw new Error('Not authenticated');
        }

        try {
            const response = await fetch(`${API_BASE}/auth/me`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify(data)
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Update failed');
            }

            this.user = result.user;
            this.saveToStorage();

            return result.user;
        } catch (error) {
            console.error('Update profile error:', error);
            throw error;
        }
    }

    /**
     * Change user password
     * @param {string} currentPassword - Current password
     * @param {string} newPassword - New password
     * @returns {Promise<Object>} Result message
     */
    async changePassword(currentPassword, newPassword) {
        if (!this.user) {
            throw new Error('Not authenticated');
        }

        try {
            const response = await fetch(`${API_BASE}/auth/change-password`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify({ currentPassword, newPassword })
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Password change failed');
            }

            return result;
        } catch (error) {
            console.error('Change password error:', error);
            throw error;
        }
    }

    /**
     * Logout user — clears localStorage and httpOnly cookie via server
     */
    async logout() {
        // Clear the httpOnly cookie server-side
        try {
            await fetch(`${API_BASE}/auth/logout`, {
                method: 'POST',
                credentials: 'include',
            });
        } catch (e) {
            // Best-effort; continue clearing local state
        }
        this.clearStorage();
    }

    /**
     * Check if user is authenticated
     * @returns {boolean} True if user is logged in
     */
    isAuthenticated() {
        return !!this.user;
    }

    /**
     * Get current user
     * @returns {Object|null} User object or null
     */
    getUser() {
        return this.user;
    }

    /**
     * Get auth token — returns null; auth is managed via httpOnly cookie.
     * Kept for backward compatibility with call sites that check token presence.
     * @returns {null}
     */
    getToken() {
        return null;
    }
}

// Create singleton instance
const authService = new AuthService();

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.authService = authService;
}
