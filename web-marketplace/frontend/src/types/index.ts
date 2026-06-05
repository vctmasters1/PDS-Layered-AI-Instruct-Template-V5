// ============================================================================
// Shared TypeScript interfaces — mirrored from API response shapes
// ============================================================================

export interface User {
  id: string
  email: string
  firstName: string | null
  lastName: string | null
  displayName?: string | null
  role: string          // 'buyer' | 'designer' | 'producer' | 'admin' | etc.
  isStaff: boolean
  deviceNetworkAccess: boolean
  propertyPortalAccess: boolean
  resumeAccess: boolean
  isPropertyManager: boolean
  isPropertyTenant: boolean
  phone?: string | null
  businessAddress?: string | null
  businessCity?: string | null
  businessState?: string | null
  businessZip?: string | null
  businessLatitude?: number | null
  businessLongitude?: number | null
  locationPrivate?: boolean
  customPinLat?: number | null
  customPinLng?: number | null
}

export interface Designer {
  id: string
  userId: string
  displayName?: string | null
  name: string
  businessName?: string
  emoji?: string
  location?: string
  city?: string
  state?: string
  latitude?: number | null
  longitude?: number | null
  rating: number
  reviewCount: number
  verifiedReviewCount?: number
  specialties?: string
  capabilities?: string
  bio?: string
  availability?: 'available' | 'busy' | 'waitlist_only' | 'unavailable'
  waitlistCount?: number
  averageLeadTime?: number
  services?: Record<string, unknown>
  activeMaterials?: boolean
  distance?: number | null
}

export interface Producer {
  id: string
  userId: string
  displayName?: string | null
  name: string
  businessName?: string
  emoji?: string
  location?: string
  city?: string
  state?: string
  latitude?: number | null
  longitude?: number | null
  rating: number
  reviewCount: number
  verifiedReviewCount?: number
  capabilities?: string
  leadTime?: string
  bio?: string
  availability?: 'available' | 'busy' | 'waitlist_only' | 'unavailable'
  waitlistCount?: number
  services?: Record<string, unknown>
  activeMaterials?: boolean
  distance?: number | null
}

export interface BiddingProducer {
  id: string
  name: string
  latitude?: number | null
  longitude?: number | null
  leadTime?: string
  quote: number
  distance?: number | null
}

export interface Product {
  id: string
  name: string
  category?: string
  emoji?: string
  image?: string
  images?: string[]
  designerId?: string | null
  designerName?: string
  designerLatitude?: number | null
  designerLongitude?: number | null
  price: number
  stock: number
  leadTime?: number
  rating?: number
  reviewCount?: number
  verifiedReviewCount?: number
  description?: string
  selfDesigned?: boolean
  allowBidding?: boolean
  biddingProducers?: BiddingProducer[]
  waitlistCount?: number
  distance?: number | null
  totalPrice?: number
  designFee?: number
  selectedProducer?: BiddingProducer
}

export interface Service {
  id: string
  title: string
  description?: string
  category?: string
  price?: number
  leadDays?: number
  userId: string
  createdAt: string
}

export interface BulletinCard {
  id: string
  title: string
  description?: string
  category?: string
  budget?: number
  deadline?: string
  capabilities?: string[]
  userId: string
  user?: { firstName: string | null; lastName: string | null; email: string }
  createdAt: string
}

export interface Order {
  id: string
  status: string
  totalAmount: number
  createdAt: string
  product?: Product
  buyer?: User
  producer?: Producer
  designer?: Designer
}

export interface Message {
  id: string
  body: string
  senderId: string
  conversationId: string
  createdAt: string
  read: boolean
}

export interface Conversation {
  id: string
  participants: User[]
  lastMessage?: Message
  updatedAt: string
  unreadCount?: number
}

export interface Notification {
  id: string
  type: string
  message: string
  read: boolean
  createdAt: string
}

export interface AdminStats {
  totalUsers: number
  totalProducts: number
  totalOrders: number
  totalRevenue: number
  activeDesigners: number
  activeProducers: number
  pendingDisputes: number
  totalMessages?: number
}

export interface AdminUser extends User {
  verified: boolean
  emailVerified: boolean
  active: boolean
  createdAt: string
  suspendedUntil?: string | null
  suspendedReason?: string | null
  staffRole?: string | null
}

export interface Dispute {
  id: string
  orderId: string
  reason: string
  description?: string
  status: string
  createdAt: string
  order?: Order
  reporter?: User
}

export interface SiteSettings {
  platformFeePercent: number
  paymentUpfrontPercent: number
  paymentShippingPercent: number
  paymentDeliveryPercent: number
  postingFeePerRequest: number
  salesTaxWithholdingPercent: number
  messagingFeePercent: number
}

export interface SearchFilters {
  query?: string
  category?: string
  capability?: string
  location?: string
  minRating?: number
  availability?: string
  limit?: number
  offset?: number
}
