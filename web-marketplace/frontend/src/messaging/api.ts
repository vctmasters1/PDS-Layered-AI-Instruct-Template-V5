// All messaging API calls — aligned with backend routes in src/routes/messaging.ts
import { api } from '../api/client'
import type { MsgConversation, MsgMessage, FeeCheck, SendFee, FeeSummary } from './types'

export function getConversations(): Promise<{ conversations: MsgConversation[] }> {
  return api.get('/messaging/conversations')
}

export function getThread(userId: string, limit = 50, offset = 0): Promise<{
  conversation: { messages: MsgMessage[]; otherUser: import('./types').MsgUser }
}> {
  return api.get(`/messaging/with/${userId}?limit=${limit}&offset=${offset}`)
}

export function checkFee(recipientId: string): Promise<FeeCheck> {
  return api.get(`/messaging/fees/check/${recipientId}`)
}

export function getFeeSummary(): Promise<{ fees: FeeSummary }> {
  return api.get('/messaging/fees/summary')
}

export function sendMessage(recipientId: string, content: string, subject?: string): Promise<{
  message: MsgMessage
  fee: SendFee
}> {
  return api.post('/messaging/send', { recipientId, content, subject: subject ?? 'Message' })
}

export function markRead(messageId: string): Promise<unknown> {
  return api.patch(`/messaging/${messageId}/read`)
}

export function grantWaiver(userId: string): Promise<unknown> {
  return api.post('/messaging/waivers/grant', { userId })
}

export function revokeWaiver(userId: string): Promise<unknown> {
  return api.post('/messaging/waivers/revoke', { userId })
}

export function searchMessages(q: string): Promise<{ results: MsgMessage[] }> {
  return api.get(`/messaging/search?q=${encodeURIComponent(q)}`)
}
