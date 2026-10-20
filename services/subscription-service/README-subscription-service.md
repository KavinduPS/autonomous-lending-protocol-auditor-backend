# Subscription Service

Subscription and billing microservice for the AI-powered smart contract security analysis platform.

The service currently provides:

- Seeded subscription plans: **FREE**, **BASIC**, and **PRO**
- PostgreSQL persistence through Prisma
- Subscription creation, lookup, status updates, eligibility checks, and test/admin deletion
- Stripe Checkout session creation for paid plans
- Stripe webhook synchronization for paid subscriptions
- Health and database readiness endpoints
- Credit-based plan entitlements

> **Important:** FREE subscriptions are local and do not require Stripe. BASIC and PRO subscriptions should become active only after Stripe confirms the subscription through a verified webhook.

---

## 1. Technology Stack

- Node.js
- TypeScript
- Express 5
- PostgreSQL
- Prisma 7
- Stripe
- Stripe CLI for local webhook testing

---

## 2. Prerequisites

Install the following before starting:

- Node.js and npm
- PostgreSQL
- Stripe CLI if you want to test paid subscriptions and webhooks locally
- A Stripe account in **test mode**

The current local PostgreSQL connection used during development is:

```text
127.0.0.1:5433
```

The database name used during development is:

```text
subscription_service_db
```

---

## 3. Install Dependencies

From the `subscription-service` directory:

```powershell
npm install
```

If Stripe has not already been installed:

```powershell
npm install stripe
```

Prisma and the other project dependencies should already be listed in `package.json`.

---

## 4. Environment Variables

Create a `.env` file in the root of `subscription-service`.

Example:

```env
PORT=3002

DATABASE_URL="postgresql://audit:change_me@127.0.0.1:5433/subscription_service_db?schema=public"

FRONTEND_URL=http://localhost:5173

STRIPE_SECRET_KEY=sk_test_your_test_secret_key
STRIPE_WEBHOOK_SECRET=whsec_your_local_or_dashboard_webhook_secret
```

### Notes

- Never commit a real `.env` file.
- Use Stripe **test mode** while developing.
- `STRIPE_SECRET_KEY` begins with `sk_test_...`.
- `STRIPE_WEBHOOK_SECRET` begins with `whsec_...`.
- The webhook secret is different from the Stripe API secret key.
- FREE plans do not need a Stripe Price ID.

---

## 5. Start PostgreSQL

Make sure PostgreSQL is running before Prisma commands are executed.

Check the current development port:

```powershell
Test-NetConnection 127.0.0.1 -Port 5433
```

Expected:

```text
TcpTestSucceeded : True
```

If it is `False`, start the PostgreSQL instance/container used by the repository before continuing.

---

## 6. Prisma Setup

Validate and generate the Prisma client:

```powershell
npx prisma format
npx prisma validate
npx prisma generate
```

Apply development migrations:

```powershell
npx prisma migrate dev
```

When creating a new migration after a schema change:

```powershell
npx prisma migrate dev --name your_migration_name
```

Example:

```powershell
npx prisma migrate dev --name change_plan_to_credit_model
```

### Prisma Client

The project generates the Prisma client into:

```text
src/generated/prisma
```

Do not manually edit generated Prisma files.

If Prisma types appear stale after changing `schema.prisma`, run:

```powershell
npx prisma generate
```

and restart the TypeScript server in VS Code if necessary.

---

## 7. Seed Subscription Plans

Plan definitions are controlled by the seed file rather than normal public API creation.

Run:

```powershell
npx prisma db seed
```

The expected plans are:

| Feature | FREE | BASIC | PRO |
|---|---:|---:|---:|
| Price | $0 | $50/month | $200/month |
| Credits / Month | 20 | 100 | 400 |
| EPA / Exploit Simulation | No | Yes | Yes |
| Extra Credit Purchase | No | Yes | Yes |
| Concurrent Audits | 1 | 1 | 2 |
| Queue Priority | STANDARD | STANDARD | HIGH |
| API Access | No | No | Yes |

### Stripe Price IDs

- FREE: `stripePriceId = null`
- BASIC: configure the actual Stripe **test** Price ID in the seed file
- PRO: configure the actual Stripe **test** Price ID in the seed file

After changing Stripe Price IDs in the seed file, rerun:

```powershell
npx prisma db seed
```

The seed should use `upsert` so repeated runs update existing plan records instead of creating duplicate FREE/BASIC/PRO plans.

---

## 8. Build the Service

Compile TypeScript:

```powershell
npm run build
```

Do not continue to runtime testing until this command succeeds.

---

## 9. Start the Service

Development mode:

```powershell
npm run dev
```

Production-style local start after building:

```powershell
npm start
```

Default local port:

```text
3002
```

---

## 10. Verify Health and Database Connectivity

Health check:

```text
GET http://localhost:3002/health
```

Expected:

```json
{
  "service": "subscription-service",
  "status": "ok"
}
```

Database readiness check:

```text
GET http://localhost:3002/ready
```

Expected:

```json
{
  "service": "subscription-service",
  "database": "connected",
  "status": "ready"
}
```

---

## 11. Plan Endpoints

Plans are seeded by the developer/system.

Recommended public routes:

```text
GET /plans
GET /plans/:id
```

Examples:

```text
GET http://localhost:3002/plans
GET http://localhost:3002/plans/{planId}
```

Plan creation, update, and deletion should not be exposed to normal users. If those routes remain for development/admin use, protect them before production.

---

## 12. Subscription Endpoints

Current subscription routes:

```text
POST   /subscriptions
GET    /subscriptions/:id
GET    /subscriptions/user/:userId
GET    /subscriptions/user/:userId/current
GET    /subscriptions/user/:userId/eligibility
PATCH  /subscriptions/:id/status
DELETE /subscriptions/:id
```

### Important Rule

`DELETE /subscriptions/:id` is intended for development/admin cleanup.

For a real customer cancellation, preserve history and update the subscription status instead:

```text
PATCH /subscriptions/:id/status
```

Example:

```json
{
  "status": "canceled"
}
```

---

## 13. FREE Subscription

FREE does not require Stripe.

Example request:

```http
POST /subscriptions
Content-Type: application/json
```

```json
{
  "userId": "9ca49ca2-9ee3-4c59-bbbc-b750caba05b1",
  "planId": "FREE_PLAN_UUID",
  "status": "active",
  "stripeCustomerId": null,
  "stripeSubscriptionId": null,
  "currentPeriodEnd": "2026-11-19T00:00:00.000Z"
}
```

The actual FREE plan UUID comes from:

```text
GET /plans
```

---

## 14. Paid Subscription Flow

BASIC and PRO should use Stripe.

The intended flow is:

```text
User chooses BASIC or PRO
        ↓
POST /stripe/checkout-session
        ↓
Stripe Checkout
        ↓
Customer completes payment
        ↓
Stripe sends webhook
        ↓
POST /stripe/webhook
        ↓
Webhook signature is verified
        ↓
Subscription is created/updated in PostgreSQL
```

Do not create an active paid subscription merely because a Checkout Session was created.

---

## 15. Stripe Checkout Endpoint

```text
POST /stripe/checkout-session
```

Example:

```json
{
  "userId": "9ca49ca2-9ee3-4c59-bbbc-b750caba05b1",
  "planCode": "BASIC"
}
```

Expected response shape:

```json
{
  "sessionId": "cs_test_...",
  "checkoutUrl": "https://checkout.stripe.com/...",
  "plan": {
    "id": "...",
    "code": "BASIC",
    "priceMinor": "5000",
    "currency": "usd",
    "creditsPerPeriod": 100
  }
}
```

The frontend redirects the user to `checkoutUrl`.

---

## 16. Stripe Webhook Endpoint

Webhook endpoint:

```text
POST /stripe/webhook
```

The webhook should process at least:

```text
checkout.session.completed
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
```

The checkout service places these values in Stripe metadata:

```text
userId
planId
planCode
```

The webhook uses those values to connect the Stripe subscription back to the local PostgreSQL subscription record.

---

## 17. Local Stripe Webhook Testing

Install and authenticate the Stripe CLI.

Login:

```powershell
stripe login
```

The current Stripe CLI requires events to be explicitly selected.

Run:

```powershell
stripe listen --events checkout.session.completed,customer.subscription.created,customer.subscription.updated,customer.subscription.deleted --forward-to localhost:3002/stripe/webhook
```

The CLI prints a webhook signing secret similar to:

```text
whsec_xxxxxxxxxxxxx
```

Copy it into `.env`:

```env
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxx
```

Restart the Node service after modifying `.env`.

### Keep Two Terminals Running

Terminal 1:

```powershell
npm run dev
```

Terminal 2:

```powershell
stripe listen --events checkout.session.completed,customer.subscription.created,customer.subscription.updated,customer.subscription.deleted --forward-to localhost:3002/stripe/webhook
```

---

## 18. Express Webhook Middleware Requirement

Stripe signature verification requires the raw request body.

The webhook route must be registered **before** the normal JSON middleware.

Correct order:

```ts
app.post(
  "/stripe/webhook",
  express.raw({ type: "application/json" }),
  stripeWebhook,
);

app.use(express.json());
```

Do not put the Stripe webhook behind `express.json()`.

---

## 19. Stripe Webhook Synchronization

The webhook calls the subscription service to create or update the local subscription using the unique Stripe subscription ID.

The synchronization operation should use an upsert:

```text
stripeSubscriptionId exists
        ↓
update existing local subscription

stripeSubscriptionId does not exist
        ↓
create local subscription
```

This helps make webhook handling idempotent.

The existing `StripeEvent` table is also used to avoid processing the same Stripe event repeatedly.

---

## 20. Current Subscription Logic

A current subscription should satisfy:

```text
status = active OR trialing
currentPeriodEnd > now
plan.isActive = true
```

Endpoint:

```text
GET /subscriptions/user/:userId/current
```

---

## 21. Eligibility Logic

Endpoint:

```text
GET /subscriptions/user/:userId/eligibility
```

The current eligibility check verifies:

- A subscription exists
- Status is eligible
- The plan is active
- The subscription period has not expired
- Plan entitlements can be returned

Plan entitlement examples:

```text
creditsPerPeriod
exploitSimulation
extraCreditsAllowed
maxConcurrentAudits
queuePriority
apiAccess
```

Actual remaining-credit accounting is a separate module and is not yet represented solely by `creditsPerPeriod`.

---

## 22. Credits

The plan model defines the monthly credit allowance:

```text
FREE  = 20
BASIC = 100
PRO   = 400
```

`creditsPerPeriod` is an entitlement/configuration value. It is not the user's current balance.

A future credit module should track:

- Monthly plan credit balance
- Extra purchased credit balance
- Credit consumption
- Credit transaction history
- Audit usage
- EPA usage

Do not modify the global Plan record when one user purchases extra credits.

---

## 23. Useful Development Commands

Format Prisma schema:

```powershell
npx prisma format
```

Validate schema:

```powershell
npx prisma validate
```

Generate Prisma client:

```powershell
npx prisma generate
```

Create/apply development migration:

```powershell
npx prisma migrate dev --name migration_name
```

Seed plans:

```powershell
npx prisma db seed
```

Open Prisma Studio:

```powershell
npx prisma studio
```

Compile TypeScript:

```powershell
npm run build
```

Start development server:

```powershell
npm run dev
```

Test PostgreSQL port:

```powershell
Test-NetConnection 127.0.0.1 -Port 5433
```

---

## 24. Common Problems

### Prisma P1001

```text
Can't reach database server at 127.0.0.1:5433
```

Check:

```powershell
Test-NetConnection 127.0.0.1 -Port 5433
```

If false, start PostgreSQL.

### Prisma Types Still Show Old Fields

If TypeScript still refers to fields such as `auditsPerPeriod` after changing the schema:

```powershell
npx prisma generate
```

Then restart the VS Code TypeScript server.

Do not edit generated Prisma files manually.

### Migration Cannot Add Required Column

If existing rows prevent a new required column from being added, provide an appropriate temporary/default value or create a migration that explicitly backfills existing rows before enforcing `NOT NULL`.

Do not run `prisma migrate reset` unless deleting all development data is acceptable.

### Stripe CLI Says Events Must Be Specified

Use:

```powershell
stripe listen --events checkout.session.completed,customer.subscription.created,customer.subscription.updated,customer.subscription.deleted --forward-to localhost:3002/stripe/webhook
```

### Webhook Signature Verification Fails

Check:

- `STRIPE_WEBHOOK_SECRET` matches the currently running Stripe CLI listener or configured dashboard endpoint
- The route uses `express.raw(...)`
- The webhook route is registered before `express.json()`
- The server was restarted after `.env` changes

---

## 25. Security Notes

Before production:

- Do not commit `.env`, Stripe secret keys, database passwords, or webhook secrets.
- Verify JWT/authentication at the API boundary.
- Do not trust a client-provided `userId` once authentication is integrated; derive it from the authenticated identity.
- Do not allow clients to activate BASIC or PRO by manually posting `status: active`.
- Paid subscription state should come from verified Stripe webhook events.
- Protect any plan-management and subscription-delete endpoints as admin/internal operations.
- Keep using Stripe webhook signature verification.
- Use HTTPS in deployed environments.
- Use Stripe live keys only in the production environment.

---

## 26. Recommended First-Time Developer Run Order

For a fresh development setup, use this order:

```text
1. Install Node.js/npm, PostgreSQL, and Stripe CLI
2. npm install
3. Create .env
4. Start PostgreSQL
5. Test port 5433
6. npx prisma format
7. npx prisma validate
8. npx prisma migrate dev
9. npx prisma generate
10. Configure BASIC/PRO Stripe test Price IDs in the seed
11. npx prisma db seed
12. npm run build
13. npm run dev
14. Test /health
15. Test /ready
16. Test /plans
17. stripe login
18. stripe listen with the required subscription events
19. Put the displayed whsec_... value in .env
20. Restart npm run dev
21. Test POST /stripe/checkout-session
22. Complete a Stripe test checkout
23. Confirm the webhook is received
24. Confirm the local subscription was created/updated
25. Test /subscriptions/user/:userId/current
26. Test /subscriptions/user/:userId/eligibility
```

---

## 27. Current MVP Plan Definitions

### FREE

- Price: $0
- 20 credits/month
- EPA/exploit simulation: disabled
- Extra credit purchase: disabled
- Concurrent audits: 1
- Queue priority: STANDARD
- API access: disabled
- Stripe checkout: not required

### BASIC

- Price: $50/month
- 100 credits/month
- EPA/exploit simulation: enabled
- Extra credit purchase: enabled
- Concurrent audits: 1
- Queue priority: STANDARD
- API access: disabled
- Stripe checkout: required

### PRO

- Price: $200/month
- 400 credits/month
- EPA/exploit simulation: enabled
- Extra credit purchase: enabled
- Concurrent audits: 2
- Queue priority: HIGH
- API access: enabled
- Stripe checkout: required

---

## 28. Status

Implemented/foundation available:

- PostgreSQL + Prisma connectivity
- Plan seeding
- Credit-based plan entitlements
- Subscription CRUD/status functionality
- Current subscription lookup
- Subscription eligibility logic
- Stripe Checkout session creation
- Stripe webhook synchronization design/implementation
- Stripe event persistence/idempotency support
- Health/readiness endpoints

Still expected as later work:

- Full credit-balance accounting
- Extra-credit purchases
- Payment/invoice persistence workflow
- Authentication/JWT integration
- Authorization for admin/internal endpoints
- Production Stripe configuration
- Production deployment configuration
