# PDS Marketplace â€” API Backend

A modern e-commerce marketplace API for American designers, producers, and buyers with just-in-time production and location-based discovery.

## Tech Stack

| Layer | Technology |
|---|---|
| Language | TypeScript (strict mode) |
| Framework | Express.js |
| ORM | TypeORM |
| Database | PostgreSQL (all environments) |
| Auth | JWT (Bearer tokens) |
| Payments | Stripe SDK |
| Real-time | Socket.IO |
| Deployment | Railway.app |

## Features

- Designer and producer management with role-based access
- Just-in-time order flow with bid/quote system
- Location-based discovery (geolocation, map integration)
- Role-based access control (buyer, designer, producer, admin)
- Product management and inventory routing
- 3-stage escrow payment milestones (40/30/30)
- Admin dashboard with user management and dispute resolution
- Messaging and notification system (17+ event types)
- Search & discovery with saved searches and favorites
- Image uploads with compression
- Two-tier review/rating system
- WebSocket real-time updates

## Project Structure

```
src/
â”œâ”€â”€ index.ts                # Express app, middleware stack, route mounting
â”œâ”€â”€ database.ts             # TypeORM DataSource (PostgreSQL)
â”œâ”€â”€ entities/               # 23 TypeORM entity classes
â”‚   â”œâ”€â”€ user.ts             # User + UserRole enum (BUYER, DESIGNER, PRODUCER, ADMIN)
â”‚   â”œâ”€â”€ designer.ts         # Designer profile (legacy table: "sellers")
â”‚   â”œâ”€â”€ producer.ts         # Producer profile (legacy table: "manufacturers")
â”‚   â”œâ”€â”€ product.ts          # Product listings
â”‚   â”œâ”€â”€ order.ts            # Purchase orders
â”‚   â”œâ”€â”€ order-item.ts       # Line items with price snapshots
â”‚   â”œâ”€â”€ bid.ts              # Producer bids on orders
â”‚   â”œâ”€â”€ payment-milestone.ts # 3-stage escrow
â”‚   â”œâ”€â”€ dispute.ts          # Order disputes
â”‚   â”œâ”€â”€ message.ts          # User-to-user messages
â”‚   â”œâ”€â”€ notification.ts     # System notifications
â”‚   â””â”€â”€ ...                 # (23 total â€” see entities/index.ts)
â”œâ”€â”€ routes/                 # 12 Express route modules
â”‚   â”œâ”€â”€ auth.ts             # /v1/auth
â”‚   â”œâ”€â”€ products.ts         # /v1/products
â”‚   â”œâ”€â”€ orders.ts           # /v1/orders
â”‚   â”œâ”€â”€ bids.ts             # /v1/bids
â”‚   â”œâ”€â”€ producer-queue.ts   # /v1/producer-queue
â”‚   â”œâ”€â”€ messaging.ts        # /v1/messaging
â”‚   â”œâ”€â”€ notifications.ts    # /v1/notifications
â”‚   â”œâ”€â”€ search.ts           # /v1/search
â”‚   â”œâ”€â”€ admin.ts            # /v1/admin
â”‚   â”œâ”€â”€ payments.ts         # /v1/payments
â”‚   â”œâ”€â”€ uploads.ts          # /v1/uploads
â”‚   â””â”€â”€ reviews.ts          # /v1/reviews
â”œâ”€â”€ middleware/
â”‚   â”œâ”€â”€ security.ts         # Helmet, rate limiters, HTTPS redirect
â”‚   â””â”€â”€ accessControl.ts    # Testing-phase access whitelist
â”œâ”€â”€ services/
â”‚   â”œâ”€â”€ websocket.ts        # Socket.IO setup
â”‚   â”œâ”€â”€ notificationService.ts
â”‚   â”œâ”€â”€ auditService.ts
â”‚   â””â”€â”€ geolocation.ts      # Haversine distance calculations
â”œâ”€â”€ jobs/
â”‚   â””â”€â”€ messaging-fee-billing.ts  # Scheduled billing (node-cron)
â”œâ”€â”€ migrations/             # TypeORM migrations (prod only)
â””â”€â”€ scripts/
    â””â”€â”€ seed-admin.ts       # Admin bootstrap
```

## Getting Started

### Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0
- Docker (for local PostgreSQL) or PostgreSQL >= 12

### Installation

```bash
npm install
```

### Development

```bash
# 1. Start PostgreSQL via Docker
npm run db:start

# 2. Copy environment template
cp .env.development.example .env

# 3. Build and start
npm run dev
```

Server starts on `http://localhost:3000`. Connects to local PostgreSQL (Docker).

### Production Build

```bash
npm run build
npm start
```

### Health Check

```
GET /health â†’ { "status": "ok", "timestamp": "..." }
GET /v1/api/version â†’ { "version": "1.0.0", "name": "PDS Marketplace API" }
```

## API Endpoints

| Module | Count | Base Path | Auth |
|---|---|---|---|
| Auth | 3 | `/v1/auth` | Rate-limited |
| Products | 6 | `/v1/products` | JWT (designer) |
| Orders | 8+ | `/v1/orders` | JWT + rate-limited |
| Bids | 7 | `/v1/bids` | JWT |
| Producer Queue | 5 | `/v1/producer-queue` | JWT (producer) |
| Messaging | 7 | `/v1/messaging` | JWT |
| Notifications | 7 | `/v1/notifications` | JWT |
| Search | 11 | `/v1/search` | JWT |
| Admin | 13 | `/v1/admin` | JWT (isStaff) |
| Payments | 3+ | `/v1/payments` | JWT + Stripe |
| Uploads | 2 | `/v1/uploads` | JWT |
| Reviews | 4+ | `/v1/reviews` | JWT |
| **Total** | **76+** | | |

## Authentication

JWT-based. Include token in `Authorization: Bearer <token>` header.

- `POST /v1/auth/register` â€” Create account (buyer, designer, or producer)
- `POST /v1/auth/login` â€” Get JWT token
- `GET /v1/auth/profile` â€” Get current user profile

## User Roles

| Role | Enum | Description |
|---|---|---|
| Buyer | `BUYER` | Purchases products, tracks orders |
| Designer | `DESIGNER` | Creates products, routes orders to producers |
| Producer | `PRODUCER` | Bids on orders, manufactures products |
| Admin | `ADMIN` | Platform management, user/dispute resolution |

> **Note:** The database tables `sellers` and `manufacturers` retain legacy names for migration stability. The ORM entities are `Designer` and `Producer`.

## Deployment (Railway)

- **Platform:** Railway.app (auto-deploy from `master`)
- **Database:** Railway-managed PostgreSQL
- **Build:** `npm run build` (TypeScript â†’ `dist/`)
- **Start:** `node dist/index.js`

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `NODE_ENV` | Yes | `production` or `development` |
| `PORT` | No | Server port (default: 3000) |
| `DATABASE_URL` | Yes (prod) | PostgreSQL connection URL |
| `JWT_SECRET` | Yes | JWT signing secret |
| `STRIPE_API_KEY` | No | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | No | Stripe webhook signing secret |

## Development Commands

| Command | Description |
|---|---|
| `npm run dev` | Build + start in dev mode (local PostgreSQL) |
| `npm run build` | Compile TypeScript |
| `npm start` | Run production build |
| `npm run typecheck` | Type-check without emitting |
| `npm test` | Run test suite |
| `npm run db:start` | Start local PostgreSQL (Docker) |
| `npm run db:stop` | Stop local PostgreSQL |
| `npm run db:reset` | Destroy and recreate local database |
| `npm run db:migrate` | Run migrations (prod) |
| `npm run db:revert` | Revert last migration |

## Related Documentation

- [Store Instructions](../.ai/instruct.md) â€” Store-level AI agent guidance
- [API Instructions](./.ai/instruct.md) â€” API-specific AI agent guidance
- [Project Overview](../AI-SubProjectOverview.md) â€” Marketplace subproject overview
- [Database Schema](./DATABASE_SCHEMA.md) â€” Entity relationships
- [Implementation Status](./IMPLEMENTATION_STATUS.md) â€” Feature completion

## License

MIT
