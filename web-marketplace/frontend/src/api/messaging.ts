import type { Conversation, Message } from '../types'
import { api } from './client'

export function fetchConversations(): Promise<{ conversations: Conversation[] }> {
  return api.get<{ conversations: Conversation[] }>('/messaging/conversations')
}

export function fetchMessages(conversationId: string): Promise<{ messages: Message[] }> {
  return api.get<{ messages: Message[] }>(`/messaging/conversations/${conversationId}/messages`)
}

export function sendMessage(conversationId: string, body: string): Promise<Message> {
  return api.post<Message>('/messaging/send', { conversationId, body })
}

export function startConversation(recipientId: string, body: string): Promise<{ conversationId: string }> {
  return api.post<{ conversationId: string }>('/messaging/conversations', { recipientId, body })
}

export function markRead(conversationId: string): Promise<unknown> {
  return api.post(`/messaging/conversations/${conversationId}/read`, {})
}
