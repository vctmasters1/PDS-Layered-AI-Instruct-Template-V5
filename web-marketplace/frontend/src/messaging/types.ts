// Messaging module types — aligned with backend route response shapes

export interface MsgUser {
  id: string
  firstName: string | null
  lastName: string | null
  email: string
  displayName?: string | null
}

export interface MsgMessage {
  id: string
  content: string
  senderId: string
  recipientId: string
  subject?: string | null
  read: boolean
  createdAt: string
}

export interface MsgConversation {
  otherUser: MsgUser
  lastMessage: {
    content: string
    createdAt: string
    senderId: string
  }
  unreadCount: number
}

// GET /v1/messaging/fees/check/:recipientId
export interface FeeCheck {
  feeApplies: boolean
  feeAmount: string      // e.g. "1.00"
  waived: boolean        // they waived fees for me
  isResponder: boolean   // I am the responder in this conversation
  grantedWaiverToThem: boolean // I've waived fees for them
  responderHasReplied: boolean
}

// POST /v1/messaging/send → fee field
export interface SendFee {
  amount: number
  waived: boolean
  isResponder: boolean
  billingPeriod: string
  note: string
}

// GET /v1/messaging/fees/summary
export interface FeeSummary {
  todayMessages: number
  todayTotal: string
  unbilledTotal: string
  unbilledCount: number
  earnings: string
}
