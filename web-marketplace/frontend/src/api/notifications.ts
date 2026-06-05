import type { Notification } from '../types'
import { api } from './client'

export function fetchNotifications(): Promise<{ notifications: Notification[] }> {
  return api.get<{ notifications: Notification[] }>('/notifications')
}

export function markNotificationRead(id: string): Promise<unknown> {
  return api.post(`/notifications/${id}/read`, {})
}

export function markAllRead(): Promise<unknown> {
  return api.post('/notifications/read-all', {})
}
