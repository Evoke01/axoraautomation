# Business Automation MVP

Minimal full-stack business automation core for salons and gyms. This repo is isolated from the existing `New project` repo and is meant to be the reusable system that future wrapper sites sit on top of.

## What it does

- Public onboarding flow at `/start`
  - create a business from `name + type`
  - generate a unique slug
  - generate a business-specific admin passcode
  - return lead, booking, and admin links
- Public funnel routes
  - `/lead/:businessSlug`
  - `/book/:businessSlug`
  - `/admin/:businessSlug`
- Impact-first dashboard
  - bookings today
  - bookings this week
  - no-shows
  - conversion rate from leads to bookings
- Event-based automation
  - confirmation email on booking
  - reminder before the visit
  - follow-up after completion
  - re-engagement after the configured delay

No cron jobs are used. Delayed work is stored in Postgres and executed by one in-process scheduler timer.

## Stack

- Frontend: React 19, Vite, React Router
- Backend: Node.js, Express, TypeScript
- Database: Supabase Postgres via `pg`
- Email: Resend in `live` mode, DB-visible mock sends in `demo` mode
- Tests: Vitest, Testing Library, Supertest, pg-mem

## Repo layout

- `client/`: landing page, onboarding flow, public lead/booking pages, admin dashboard
- `server/`: API, scheduler, DB layer, email handling, tests
- `shared/`: Zod schemas and shared contracts

## Local setup

1. Copy `.env.example` to `.env`.
2. Set `DATABASE_URL` to a Postgres database.
3. Install dependencies:

```bash
npm install
```

4. Start development mode:

```bash
npm run dev
```

That runs:

- shared package watch
- Express API on `http://localhost:4000`
- Vite frontend on `http://localhost:5173`

## Core routes

- Public app:
  - `/`
  - `/start`
  - `/pricing`
  - `/lead/:businessSlug`
  - `/book/:businessSlug`
  - `/admin/:businessSlug`
- API:
  - `POST /api/businesses`
  - `GET /api/public-config/:businessSlug`
  - `POST /api/leads/:businessSlug`
  - `POST /api/bookings/:businessSlug`
  - `POST /api/admin/:businessSlug/login`
  - `POST /api/admin/:businessSlug/logout`
  - `GET /api/admin/:businessSlug/dashboard`
  - `PATCH /api/admin/:businessSlug/bookings/:bookingId/status`
  - `GET /api/health`

## Free production setup

This repo is configured for a zero-cost MVP stack:

- Hosting: Render Free web service
- Database: Supabase Free Postgres
- Email: Resend Free

### Supabase

1. Create a free Supabase project.
2. Open the database connection settings.
3. Copy the `Session pooler` connection string.
4. Use that value as `DATABASE_URL` locally and in Render.

Supabase is used as hosted Postgres only in this phase. There is no Supabase Auth, RLS, or Edge Function usage here.

### Render

1. Connect this repo to Render.
2. Use the included `render.yaml` Blueprint or create one free Node web service manually.
3. Set these env vars:
   - `DATABASE_URL`
   - `CLIENT_ORIGIN`
   - `APP_BASE_URL`
   - `SESSION_SECRET`
   - `EMAIL_MODE`
   - `RESEND_API_KEY`
   - `RESEND_FROM_EMAIL`
   - `SUPPORT_EMAIL`
4. Keep `CLIENT_ORIGIN` and `APP_BASE_URL` pointed at the same Render URL for the single-service deployment.

Render config in this repo uses:

- build command: `npm install && npm run build`
- start command: `npm run start`
- health check: `/api/health`

## Scripts

```bash
npm run dev
npm run build
npm test
npm run start
```

## Notes

- Business admin access is lightweight and business-specific. Passcodes are generated when the business is created.
- Conversion is tracked as `lead -> booking`, not just raw booking submissions.
- On restart, the scheduler reloads pending jobs from the database.
- Render Free is acceptable for demos and MVP usage, but sleeping hosts can delay job execution until the process wakes back up.
- Because the scheduler is in-process, delayed jobs are best-effort on free hosting and run reliably only while the service is awake.
