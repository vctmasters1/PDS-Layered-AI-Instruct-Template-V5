# PDS Marketplace - Database Schema Documentation

**Date**: February 12, 2026  
**Version**: 1.0.0  
**Status**: ✅ Implemented and compiled

## Overview

The database schema is built with TypeORM and PostgreSQL, designed for a just-in-time marketplace supporting sellers, manufacturers, and buyers with geolocation-based discovery.

## Entity Diagram

```
Users (root)
├── Sellers (1:1 relationship)
│   └── Products (1:N)
│       └── OrderItems (N:M through orders)
├── Manufacturers (1:1 relationship)
│   └── Bids (N:1 -> Orders)
└── Orders (N:1 -> Buyers)
    ├── OrderItems (1:N -> Products)
    └── Bids (1:N -> Manufacturers)
```

## Entities

### 1. User
Base user entity for all platform roles.

**Columns**:
- `id` (UUID, PK)
- `email` (VARCHAR, UNIQUE)
- `password` (VARCHAR, hashed)
- `firstName`, `lastName`, `phone` (VARCHAR, optional)
- `role` (ENUM: admin | seller | manufacturer | buyer)
- `emailVerified` (BOOLEAN, default: false)
- `active` (BOOLEAN, default: true)
- `createdAt`, `updatedAt` (TIMESTAMP)

**Indexes**:
- `email` (for login)

---

### 2. Seller
Represents individual creators, craftspeople, and small manufacturers selling their own products.

**Columns**:
- `id` (UUID, PK)
- `userId` (UUID, FK to User, UNIQUE)
- `businessName` (VARCHAR, UNIQUE)
- `businessType` (ENUM: individual | creator | small_manufacturer)
- **Location fields**:
  - `location_address`, `location_city`, `location_state`, `location_zipCode` (VARCHAR)
  - `location_country` (VARCHAR, default: "USA")
  - `location_latitude`, `location_longitude` (DECIMAL 10,8 / 11,8)
  - `location_serviceRadius` (NUMERIC, optional, in miles)
- `description` (TEXT, optional)
- `website` (VARCHAR, optional)
- `rating` (DECIMAL 3,2, range 0-5, default: 0)
- `totalSales` (INTEGER, default: 0)
- `verified` (BOOLEAN, default: false)
- `active` (BOOLEAN, default: true)
- `createdAt`, `updatedAt` (TIMESTAMP)

**Indexes**:
- `location_state` (for state-based filtering)
- `(location_latitude, location_longitude)` (for geolocation queries)

---

### 3. Manufacturer
Represents manufacturing facilities capable of bidding on and fulfilling orders.

**Columns**:
- `id` (UUID, PK)
- `userId` (UUID, FK to User, UNIQUE)
- `businessName` (VARCHAR, UNIQUE)
- **Location fields** (same as Seller):
  - Address, coordinates, service radius
- `description` (TEXT, optional)
- `website` (VARCHAR, optional)
- **Capabilities**:
  - `capabilities_materialTypes` (ARRAY of strings, e.g., ["wood", "metal", "plastic"])
  - `capabilities_productTypes` (ARRAY of strings, e.g., ["electronics", "furniture"])
  - `capabilities_minBatchSize` (INTEGER, optional)
  - `capabilities_maxCapacityPerMonth` (INTEGER, optional, units)
- **Performance metrics**:
  - `rating` (DECIMAL 3,2, 0-5, default: 0)
  - `totalOrdersFulfilled` (INTEGER, default: 0)
  - `averageLeadTime` (INTEGER, days, default: 0)
  - `acceptanceRate` (NUMERIC %, default: 0)
- `verified` (BOOLEAN, default: true)
- `active` (BOOLEAN, default: true)
- `createdAt`, `updatedAt` (TIMESTAMP)

**Indexes**:
- `location_state` (for state-based filtering)
- `(location_latitude, location_longitude)` (for geolocation queries)

---

### 4. Product
Represents items for sale by sellers, with flexible fulfillment options.

**Columns**:
- `id` (UUID, PK)
- `sellerId` (UUID, FK to Seller, ON DELETE CASCADE)
- `name` (VARCHAR)
- `description` (TEXT)
- `sku` (VARCHAR)
- `price` (DECIMAL 10,2)
- `manufacturingRequirements` (TEXT, optional, e.g., "custom color, 2-week lead time")
- `leadTime` (INTEGER, days)
- `fulfilledBy` (ENUM: self | manufacturer)
- `images` (ARRAY of URLs)
- `category` (VARCHAR) — e.g. furniture, equipment, textile, printing, brewing, gizmos, other
- `active` (BOOLEAN, default: true)
- `stock` (INTEGER, for self-fulfilled only, default: 0)
- `createdAt`, `updatedAt` (TIMESTAMP)

**Indexes**:
- `sellerId` (FK)
- `category` (for filtering)
- `active` (for catalog queries)

---

### 5. Order
Represents a customer purchase order with just-in-time fulfillment routing.

**Columns**:
- `id` (UUID, PK)
- `orderNumber` (VARCHAR, human-readable, e.g., "ORD-2026-00001")
- `buyerId` (UUID, FK to User, ON DELETE RESTRICT)
- `sellerId` (UUID, FK to Seller, optional, ON DELETE RESTRICT)
- `manufacturerId` (UUID, FK to Manufacturer, optional, ON DELETE RESTRICT)
- `status` (ENUM):
  - `pending` - Awaiting bids
  - `bid_accepted` - Manufacturer/seller selected
  - `in_production` - Being manufactured
  - `ready_to_ship` - Prepared for shipment
  - `shipped` - In transit
  - `delivered` - Customer received
  - `cancelled` - Order cancelled
  - `disputed` - Payment or fulfillment dispute
- **Pricing**:
  - `totalAmount` (DECIMAL 10,2)
  - `tax` (DECIMAL 10,2, optional)
  - `shippingCost` (DECIMAL 10,2, optional)
- **Shipping address**:
  - `shippingAddress`, `shippingCity`, `shippingState`, `shippingZipCode` (VARCHAR)
  - `shippingCountry` (VARCHAR, default: "USA")
- **Buyer info**:
  - `buyerEmail`, `buyerPhone` (VARCHAR)
- **Production**:
  - `estimatedLeadTime` (INTEGER, days, optional)
  - `productionNotes` (TEXT, optional)
- **Payment**:
  - `paymentReceived` (BOOLEAN, default: false)
  - `stripePaymentId` (VARCHAR, Stripe charge ID)
- `createdAt`, `updatedAt` (TIMESTAMP)

**Indexes**:
- `buyerId` (for buyer order history)
- `sellerId` (for seller orders)
- `manufacturerId` (for manufacturer orders)
- `status` (for filtering and workflows)
- `createdAt` (for ordering/analytics)

---

### 6. OrderItem
Join table linking orders to products with quantity and pricing.

**Columns**:
- `id` (UUID, PK)
- `orderId` (UUID, FK to Order, ON DELETE CASCADE)
- `productId` (UUID, FK to Product, ON DELETE RESTRICT)
- `quantity` (INTEGER)
- `unitPrice` (DECIMAL 10,2, price at time of order)
- `totalPrice` (DECIMAL 10,2, quantity × unitPrice)
- `createdAt`, `updatedAt` (TIMESTAMP)

**Indexes**:
- `orderId` (for order details)
- `productId` (for product sales analytics)

---

### 7. Bid
Manufacturer bids on orders in just-in-time fulfillment model.

**Columns**:
- `id` (UUID, PK)
- `orderId` (UUID, FK to Order, ON DELETE CASCADE)
- `manufacturerId` (UUID, FK to Manufacturer, ON DELETE CASCADE)
- `quotedPrice` (DECIMAL 10,2, manufacturer's quote)
- `leadTimeDays` (INTEGER, time to complete)
- `productionDetails` (TEXT, optional, how they'll produce it)
- `notes` (TEXT, optional)
- `status` (ENUM):
  - `pending` - Awaiting response
  - `accepted` - Seller accepted this bid
  - `rejected` - Seller rejected
  - `expired` - Bid expired
  - `withdrawn` - Manufacturer withdrew
- `expiresAt` (TIMESTAMP, when bid expires)
- `selected` (BOOLEAN, true if this bid won the order)
- `createdAt`, `updatedAt` (TIMESTAMP)

**Indexes**:
- `orderId` (for order bids)
- `manufacturerId` (for manufacturer bid history)
- `status` (for bid workflows)
- `expiresAt` (for expired bid cleanup)

---

## Database Features

### Geolocation Support
- **Coordinates**: Latitude and longitude stored to 8 decimal places (~1 meter accuracy)
- **Haversine Distance Calculation**: Ready for distance-based queries
- **Service Radius**: Optional field for designer/producer service areas
- **Indexes**: Composite indexes on (latitude, longitude) for efficient spatial queries

### Just-In-Time Order Flow
1. **Pending**: Order placed, awaiting fulfillment decision
2. **Bids**: Multiple manufacturers submit bids
3. **Selection**: Seller/Admin selects best bid or fulfills themselves
4. **Production**: Manufacturer produces on-demand
5. **Delivery**: Item shipped to buyer

### Role-Based Data
- **Users**: Base table for all roles
- **Sellers**: Can list products and route orders
- **Manufacturers**: Can bid on orders
- **Buyers**: Can place orders
- **Admins**: Can manage all entities

### Data Integrity
- Foreign key constraints prevent orphaned records
- CASCADE deletes for related data (e.g., delete user → delete seller profile)
- RESTRICT deletes for critical relationships (e.g., cannot delete user with active orders)
- Unique constraints on email and business names

### Performance Indexes
- All foreign keys indexed
- Geolocation queries optimized with composite indexes
- Status-based filtering indexed
- Timestamp indexes for temporal queries

---

## Connection Details

**Database Configuration**:
- Type: PostgreSQL
- Host: `process.env.POSTGRES_HOST` (default: localhost)
- Port: `process.env.POSTGRES_PORT` (default: 5432)
- User: `process.env.POSTGRES_USER` (default: postgres)
- Password: `process.env.POSTGRES_PASSWORD`
- Database: `process.env.POSTGRES_DB` (default: pds_marketplace)

**File Locations**:
- Entities: `src/entities/*.ts`
- Database Config: `src/database.ts`
- Migrations: `src/migrations/*.ts`
- Compiled DB config: `dist/database.js` (for production)

---

## Migration & Setup

### Development
```bash
# Auto-sync schema (TypeORM synchronize: true in DEV)
npm run dev

# Or manually sync:
npm run db:sync
```

### Production
```bash
# Run migrations
npm run db:migrate

# Or with dev source:
npm run db:migrate:dev
```

### Generate New Migrations
```bash
npm run db:generate -- -n MigrationName
```

### Revert Last Migration
```bash
npm run db:revert
```

---

## SQL Schema Preview

```sql
-- Example: User registration + seller setup
INSERT INTO users (email, password, role) 
VALUES ('creator@example.com', '$2b$10$...hashed...', 'seller');

INSERT INTO sellers (userId, businessName, businessType, location_address, 
  location_city, location_state, location_zipCode, location_latitude, location_longitude)
VALUES (UUID_FROM_ABOVE, 'Smith Woodworking', 'creator', 
  '123 Main St', 'Portland', 'OR', '97214', 45.5152, -122.6784);

-- Example: Geolocation query
SELECT * FROM sellers 
WHERE location_state = 'OR' 
  AND location_latitude BETWEEN 45.4 AND 45.6 
  AND location_longitude BETWEEN -122.8 AND -122.5
ORDER BY rating DESC;

-- Example: Order with bids
INSERT INTO orders (orderNumber, buyerId, status, totalAmount, shippingAddress, ...)
VALUES ('ORD-2026-00001', BUYER_UUID, 'pending', 250.00, '456 Oak Ave', ...);

INSERT INTO bids (orderId, manufacturerId, quotedPrice, leadTimeDays, expiresAt, status)
VALUES (ORDER_UUID, MFG_UUID_1, 200.00, 7, NOW() + INTERVAL '3 days', 'pending');
```

---

## Security Considerations

- **Password Hashing**: Use bcrypt for user passwords
- **Location Privacy**: Allow users to restrict location visibility
- **Payment Data**: Never store raw credit card data (use Stripe tokens)
- **Audit Logging**: Track all order state changes
- **Role-Based Access**: Enforce permissions at API layer
- **Data Validation**: Joi validation for all inputs

---

## Future Enhancements

- [ ] Full-text search on product descriptions
- [ ] Advanced analytics tables (sales, trends)
- [ ] Messaging/Chat history tables
- [ ] Review & ratings tables
- [ ] Dispute resolution tracking
- [ ] Email notification logs
- [ ] API key management
- [ ] Audit trail tables

---

## Compilation Status

✅ All 7 TypeScript entities compiled successfully  
✅ Type definitions (.d.ts) generated  
✅ JavaScript output ready for runtime  
✅ Migration files compiled  
✅ Database configuration compiled

**Compiled Files**:
- `dist/entities/*.js` & `dist/entities/*.d.ts`
- `dist/database.js` & `dist/database.d.ts`
- `dist/migrations/*.js` & `dist/migrations/*.d.ts`

Ready for database initialization and API development!
