# Business Automation MVP

Minimal full-stack business automation core for salon/gym-style bookings. This repo is isolated from the existing `New project` repo and ships as a separate MVP system.

## What it includes

- React + Vite frontend with:
  - public booking form
  - pricing hooks page
  - passcode-protected admin dashboard
- Express backend with:
  - booking API
  - demo reset and autoplay endpoints
  - instant confirmation email flow
  - DB-backed delayed job scheduler using one active timer
- Shared TypeScript package for schemas and API contracts
- Demo-first defaults:
  - one hardcoded business: `Demo Salon`
  - services: `haircut`, `facial`
  - seeded fake data
  - one-click 30-second demo mode

## Tech stack

- Frontend: React 19, Vite, React Router
- Backend: Node.js, Express, TypeScript
- Database: Postgres via `pg` on Supabase Free
- Email: Resend in `live` mode, DB-visible mock sends in `demo` mode
- Tests: Vitest, Testing Library, Supertest, pg-mem

## Repo layout

- `client/`: public site, pricing page, admin dashboard
- `server/`: API, scheduler, DB layer, email handling, tests
- `shared/`: Zod schemas and shared types

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

This runs:

- shared package watch
- Express API on `http://localhost:4000`
- Vite frontend on `http://localhost:5173`

## Free production setup

This repo is configured for a zero-cost MVP stack:

- Hosting: Render Free web service
- Database: Supabase Free Postgres
- Email: Resend Free

### Supabase

1. Create a free Supabase project.
2. Open the project database connection settings.
3. Copy the `Session pooler` connection string.
4. Use that value as `DATABASE_URL` in Render and local `.env` if you want to point at Supabase directly.

The app already uses `pg` and plain SQL, so no Supabase SDK setup is required in this phase.

### Render

1. Connect this repo to Render.
2. Use the included `render.yaml` Blueprint or create one free Node web service manually.
3. Set the required env vars:
   - `DATABASE_URL`
   - `CLIENT_ORIGIN`
   - `APP_BASE_URL`
   - `ADMIN_PASSCODE`
   - `SESSION_SECRET`
   - `EMAIL_MODE`
   - `RESEND_API_KEY`
   - `RESEND_FROM_EMAIL`
   - `SUPPORT_EMAIL`
4. Keep `CLIENT_ORIGIN` and `APP_BASE_URL` equal to your Render URL for the single-service deployment.

Render config in this repo uses:

- build command: `npm install && npm run build`
- start command: `npm run start`
- health check: `/api/health`

## Demo flow

- Log into `/admin` with `ADMIN_PASSCODE`
- Click `Run 30s demo`
- Timeline:
  - immediate confirmation
  - reminder at `+10s`
  - auto-complete at `+15s`
  - follow-up at `+20s`
  - re-engagement at `+30s`

## Scripts

```bash
npm run dev
npm run build
npm test
npm run start
```

## Notes

- No cron jobs are used.
- Delayed work is tied to individual bookings and stored in the `jobs` table.
- On restart, the scheduler reloads pending jobs from the database.
- Supabase is used as hosted Postgres only in this phase. There is no Supabase Auth, RLS, or Edge Function usage yet.
- Render Free is acceptable for demos and MVP usage, but sleeping hosts can delay job execution until the process wakes back up.
- Because the scheduler is in-process, delayed jobs are best-effort on free hosting and will run reliably only while the service is awake.
