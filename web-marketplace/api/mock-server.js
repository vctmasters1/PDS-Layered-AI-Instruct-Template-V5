/**
 * Mock Express Server for Testing Auth API
 * This server simulates the auth endpoints without requiring a database
 * Useful for testing the frontend signup/login flow
 */

const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key-change-in-production';
const TOKEN_EXPIRY = '7d';
const PORT = 3000;

// In-memory user storage for testing
const users = new Map();

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', type: 'mock', timestamp: new Date().toISOString() });
});

// API version
app.get('/v1/api/version', (req, res) => {
  res.json({ version: '1.0.0', name: 'PDS Marketplace API (Mock)' });
});

// Verify token middleware
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Register endpoint
app.post('/v1/auth/register', async (req, res) => {
  try {
    const { email, password, firstName, lastName, roles } = req.body;
    
    // Validate input
    if (!email || !password || !Array.isArray(roles) || roles.length === 0) {
      return res.status(400).json({ 
        error: 'Email, password, and at least one role are required' 
      });
    }
    
    // Check if user already exists
    if (users.has(email)) {
      return res.status(409).json({ error: 'User with this email already exists' });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Store user
    const user = {
      id: userId,
      email,
      password: hashedPassword,
      firstName: firstName || '',
      lastName: lastName || '',
      phone: '',
      role: roles[0],
      roles: roles,
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    users.set(email, user);
    
    // Generate token
    const token = jwt.sign({ userId }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
    
    const userResponse = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      role: user.role,
      roles: user.roles,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
    };
    
    res.status(201).json({
      message: 'User created successfully',
      user: userResponse,
      token,
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Login endpoint
app.post('/v1/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    const user = users.get(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
    
    const userResponse = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      role: user.role,
      roles: user.roles,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
    };
    
    res.json({
      message: 'Login successful',
      user: userResponse,
      token,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get profile endpoint
app.get('/v1/auth/me', verifyToken, (req, res) => {
  try {
    let user = null;
    for (const [email, userData] of users.entries()) {
      if (userData.id === req.userId) {
        user = userData;
        break;
      }
    }
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const userResponse = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      role: user.role,
      roles: user.roles,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
    };
    
    res.json({ user: userResponse });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update profile endpoint
app.put('/v1/auth/me', verifyToken, (req, res) => {
  try {
    const { firstName, lastName, phone } = req.body;
    
    let user = null;
    let userEmail = null;
    for (const [email, userData] of users.entries()) {
      if (userData.id === req.userId) {
        user = userData;
        userEmail = email;
        break;
      }
    }
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    if (firstName) user.firstName = firstName;
    if (lastName) user.lastName = lastName;
    if (phone) user.phone = phone;
    user.updatedAt = new Date();
    
    users.set(userEmail, user);
    
    const userResponse = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      role: user.role,
      roles: user.roles,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
    
    res.json({
      message: 'Profile updated successfully',
      user: userResponse,
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Change password endpoint
app.post('/v1/auth/change-password', verifyToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password are required' });
    }
    
    let user = null;
    let userEmail = null;
    for (const [email, userData] of users.entries()) {
      if (userData.id === req.userId) {
        user = userData;
        userEmail = email;
        break;
      }
    }
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    
    user.password = await bcrypt.hash(newPassword, 10);
    user.updatedAt = new Date();
    users.set(userEmail, user);
    
    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Mock Auth Server running on http://localhost:${PORT}`);
  console.log(`📍 Type: In-Memory (no database required)`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🔐 Auth endpoints ready at /v1/auth/*`);
  console.log(`\n⚠️  WARNING: This is a MOCK server for testing only. Data will be lost on restart.\n`);
});

module.exports = app;
