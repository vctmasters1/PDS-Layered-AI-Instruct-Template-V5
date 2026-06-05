import type { Order } from '../types'
import { api } from './client'

export function fetchMyOrders(): Promise<{ orders: Order[] }> {
  return api.get<{ orders: Order[] }>('/orders')
}

export function fetchOrderById(id: string): Promise<Order> {
  return api.get<Order>(`/orders/${id}`)
}
