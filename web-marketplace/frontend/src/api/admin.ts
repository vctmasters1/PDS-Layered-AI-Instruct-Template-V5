import type { AdminStats, AdminUser, Dispute, SiteSettings, Order } from '../types'
import { api } from './client'

// ── Analytics ─────────────────────────────────────────────────────────────

export function fetchAdminStats(): Promise<AdminStats> {
  return api.get<AdminStats>('/admin/analytics')
}

// ── Users ──────────────────────────────────────────────────────────────────

export function fetchAdminUsers(search?: string, role?: string): Promise<{ users: AdminUser[] }> {
  const p = new URLSearchParams()
  if (search) p.set('search', search)
  if (role) p.set('role', role)
  return api.get<{ users: AdminUser[] }>(`/admin/users?${p}`)
}

export function updateUserRole(userId: string, role: string): Promise<unknown> {
  return api.put(`/admin/users/${userId}/role`, { role })
}

export function updateUserServiceAccess(
  userId: string,
  access: { deviceNetworkAccess?: boolean; propertyPortalAccess?: boolean; resumeAccess?: boolean }
): Promise<unknown> {
  return api.patch(`/admin/users/${userId}/service-access`, access)
}

export function suspendUser(userId: string, reason: string): Promise<unknown> {
  return api.post(`/admin/users/${userId}/suspend`, { reason })
}

export function unsuspendUser(userId: string): Promise<unknown> {
  return api.post(`/admin/users/${userId}/unsuspend`, {})
}

export function verifyUser(userId: string): Promise<unknown> {
  return api.post(`/admin/users/${userId}/verify`, {})
}

export function deleteUser(userId: string): Promise<unknown> {
  return api.delete(`/admin/users/${userId}`)
}

// ── Orders ──────────────────────────────────────────────────────────────────

export function fetchAdminOrders(): Promise<{ orders: Order[] }> {
  return api.get<{ orders: Order[] }>('/admin/orders')
}

// ── Disputes ──────────────────────────────────────────────────────────────

export function fetchDisputes(): Promise<{ disputes: Dispute[] }> {
  return api.get<{ disputes: Dispute[] }>('/admin/disputes')
}

export function resolveDispute(id: string, resolution: string): Promise<unknown> {
  return api.post(`/admin/disputes/${id}/resolve`, { resolution })
}

// ── Settings ──────────────────────────────────────────────────────────────

export function fetchSiteSettings(): Promise<SiteSettings> {
  return api.get<SiteSettings>('/admin/settings')
}

export function updateSiteSettings(settings: Partial<SiteSettings>): Promise<unknown> {
  return api.put('/admin/settings', settings)
}
