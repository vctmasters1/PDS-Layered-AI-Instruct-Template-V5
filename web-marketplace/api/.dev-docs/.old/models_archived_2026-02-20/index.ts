/**
 * Designer Model
 * Represents a designer or creator in the marketplace
 */
export interface DesignerLocation {
  address: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  latitude: number;
  longitude: number;
  serviceRadius?: number; // miles
}

export interface Designer {
  id: string;
  name: string;
  email: string;
  phone?: string;
  businessType: "individual" | "creator" | "small_producer";
  location: DesignerLocation;
  description?: string;
  website?: string;
  rating: number; // 0-5
  totalSales: number;
  verified: boolean;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Producer Model
 * Represents a producer who bids on orders
 */
export interface ProducerCapability {
  materialType: string[];
  productTypes: string[];
  minBatchSize?: number;
  maxCapacityPerMonth?: number;
}

export interface Producer {
  id: string;
  name: string;
  email: string;
  phone?: string;
  location: DesignerLocation;
  description?: string;
  website?: string;
  capabilities: ProducerCapability;
  rating: number; // 0-5
  totalOrdersFulfilled: number;
  averageLeadTime: number; // days
  verified: boolean;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Bid Model
 * Represents a producer's bid on an order
 */
export interface Bid {
  id: string;
  orderId: string;
  producerId: string;
  quotedPrice: number;
  leadTimeDays: number;
  productionDetails?: string;
  notes?: string;
  status: "pending" | "accepted" | "rejected" | "expired";
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Product Model
 */
export interface Product {
  id: string;
  designerId: string;
  name: string;
  description: string;
  sku: string;
  price: number;
  manufacturingRequirements?: string;
  leadTime: number; // days
  images: string[];
  category: string;
  fulfilled_by: "self" | "producer";
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}
