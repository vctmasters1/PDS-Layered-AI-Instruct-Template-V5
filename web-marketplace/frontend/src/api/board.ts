import type { BulletinCard } from '../types'
import { api } from './client'

export function fetchBulletinBoard(category?: string): Promise<{ items: BulletinCard[] }> {
  const p = category ? `?category=${encodeURIComponent(category)}` : ''
  return api.get<{ items: BulletinCard[] }>(`/bulletin-board${p}`)
}

export function createBulletinCard(data: Partial<BulletinCard>): Promise<BulletinCard> {
  return api.post<BulletinCard>('/bulletin-board', data)
}

export function deleteBulletinCard(id: string): Promise<unknown> {
  return api.delete(`/bulletin-board/${id}`)
}
