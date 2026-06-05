# Test Paths — web-marketplace

**Last Updated**: 2026-05-28
**System Map Reference**: PATH 8 (marketplace auth, products, orders, payments, reviews, search, messaging)

Covers the Marketplace API (Express + TypeORM, 20 routes, 8 services) and the React frontend. API checkpoints require `DATABASE_URL` pointing to a running PostgreSQL instance (use `npm run db:start` to spin up Docker).

---

## Checkpoints

### 1. API builds without TypeScript errors
**Type**: auto
**Command**:
```shell
cd k:\PDS-Master-001\web-marketplace\api && npm run build 2>&1 && echo "BUILD_OK"
```
**Pass**: `BUILD_OK` printed, `dist/` populated
**On fail**: Run `npx tsc --noEmit` for the full error list; most common issue is a missing entity import or type mismatch in a route handler

---

### 2. Frontend builds without errors
**Type**: auto
**Command**:
```shell
cd k:\PDS-Master-001\web-marketplace\frontend && npm run build 2>&1 && echo "BUILD_OK"
```
**Pass**: `BUILD_OK` printed, `dist/` populated
**On fail**: Check for broken imports in `src/pages/` or `src/api/` — the build uses `vite build`; TypeScript errors surface as Vite warnings then errors

---

### 3. POST /v1/auth/register + /v1/auth/login — JWT issued
**Type**: manual
**Pass**: `POST /v1/auth/register` returns 201 with `{ token, user }`; subsequent `POST /v1/auth/login` with same credentials returns 200 with a valid JWT; decoding the token reveals correct `userId` and `role`
**On fail**: Check `config/jwt.ts` for `JWT_SECRET` env var; check user entity `password` column is being hashed before save (bcrypt)

---

### 4. GET /v1/products — unauthenticated 401
**Type**: manual
**Pass**: `curl -s -o /dev/null -w "%{http_code}" http://localhost:PORT/v1/products` returns `401` (assuming products are protected); or returns listing if public — verify against `routes/products.ts` middleware chain
**On fail**: Authentication middleware not applied; check `middleware/security.ts` is mounted before the route

---

### 5. POST /v1/products (authenticated) → product created + returned
**Type**: manual
**Pass**: With valid JWT in `Authorization: Bearer`, POST a product payload → 201 with `{ id, title, price, creatorId }` where `creatorId` matches the token's `userId`
**On fail**: Access control in `middleware/accessControl.ts` is rejecting — check role (`creator` vs `buyer`) in token claims

---

### 6. POST /v1/orders + payment intent created
**Type**: manual
**Pass**: `POST /v1/orders` with a valid `productId` → 201; response includes `orderId` and `paymentIntentClientSecret`; row visible in `orders` table with status `pending`
**On fail**: Stripe test key not set (`STRIPE_SECRET_KEY`); check `config/stripe.ts` fallback for dev mode

---

### 7. Stripe webhook — payment_intent.succeeded updates order status
**Type**: manual
**Pass**: POST `/v1/payments/webhook` with a Stripe `payment_intent.succeeded` event (use Stripe CLI `stripe trigger payment_intent.succeeded`) → order status in DB changes from `pending` to `paid`; notification row created for the seller
**On fail**: Webhook signature verification failing — check `STRIPE_WEBHOOK_SECRET` env var matches the CLI forwarding secret

---

### 8. POST /v1/reviews — review attached to order
**Type**: manual
**Pass**: After a paid order exists, buyer POSTs `/v1/reviews` with `{ orderId, rating, comment }` → 201; GET `/v1/products/:id` includes the review in the response
**On fail**: FK constraint failing — check `order.buyerId` matches the authenticated user before allowing review

---

### 9. GET /v1/search?q=... — returns filtered results
**Type**: manual
**Pass**: `GET /v1/search?q=test` returns an array of products/services matching the query; empty query returns all (or a paginated first page); response time under 500ms on dev DB
**On fail**: `services/geocode.ts` or `services/geolocation.ts` throwing on missing `GEOCODE_API_KEY` — ensure dev fallback branch exists

---

### 10. WebSocket connection — notification delivered in real time
**Type**: manual
**Pass**: Open a WS connection to the server (e.g. using `wscat`); trigger a notification-generating action (e.g. a new order placed); the WS client receives a `notification` event within 2 seconds
**On fail**: Check `services/websocket.ts` — `io.to(userId).emit(...)` call — verify `userId` room join happens on auth handshake

---

### 11. GET /v1/admin/audit-logs — requires admin role
**Type**: manual
**Pass**: Request with a non-admin JWT returns 403; request with admin JWT returns paginated audit log array
**On fail**: `middleware/accessControl.ts` role check is not differentiating `admin` from `creator`/`buyer` — check role enum values match what's stored in the `users` table

---

### 12. Frontend vitest unit tests pass
**Type**: auto
**Command**:
```shell
cd k:\PDS-Master-001\web-marketplace\frontend && npx vitest run 2>&1
```
**Pass**: All tests pass (or `No test files found` if the `__tests__/` directory only has `setup.ts`)
**On fail**: Check `vitest.config.ts` include patterns; setup file imports may be failing if Vite aliases are not resolved in the test environment
