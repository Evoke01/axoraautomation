# Axora

Axora is an autonomous content distribution backend for creator video assets. This repository now contains:

- `backend/`: the TypeScript backend foundation for uploads, validation, planning, review gating, BullMQ orchestration, platform connection flows, metrics polling, optimization snapshots, and weekly opportunity reporting
- `frontend/`: the Axora dashboard UI, including live platform connection management in Settings

## Backend stack

- Fastify + TypeScript
- Prisma + PostgreSQL
- BullMQ + Redis
- S3-compatible object storage for raw assets
- YouTube OAuth + publishing adapter
- Instagram OAuth setup scaffolding
- TikTok OAuth setup scaffolding

## Backend setup

1. Copy `backend/.env.example` to `backend/.env`.
2. Provision PostgreSQL, Redis, and an S3-compatible bucket.
3. Install dependencies:
   `cd backend && npm install`
4. Generate Prisma client:
   `npm run prisma:generate`
5. Apply your database schema:
   `npm run prisma:push`
6. Start the backend:
   `npm run dev`

## Platform API setup

Set these env vars before using the Settings screen to connect accounts:

- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`
- `INSTAGRAM_CLIENT_ID`, `INSTAGRAM_CLIENT_SECRET`, `INSTAGRAM_REDIRECT_URI`
- `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `TIKTOK_REDIRECT_URI`
- `FRONTEND_APP_URL`

Optional endpoint override vars are also supported for Instagram and TikTok.

Current platform scope:

- `YouTube`: full OAuth connect, upload, publish, and metrics polling
- `Instagram`: OAuth account connection scaffolding and token storage
- `TikTok`: OAuth account connection scaffolding and token storage with refresh support
- `LinkedIn` and `X`: intentionally not connectable in the current MVP

## Connection routes

- `GET /connections`
- `POST /connections/youtube/start`
- `GET /connections/youtube/callback`
- `POST /connections/instagram/start`
- `GET /connections/instagram/callback`
- `POST /connections/tiktok/start`
- `GET /connections/tiktok/callback`
- `POST /connections/:id/disconnect`

## Key backend flows

- Direct multipart asset upload initialization and completion
- Hard asset validation with MIME sniffing and `ffprobe`
- Metadata generation and campaign planning
- Tier-based review gating
- YouTube publishing with token refresh and quota reservation
- Metrics snapshot polling and optimization recompute
- Weekly opportunity report generation
- Audit retention cleanup

## Verification

Backend checks completed:

- `npm run prisma:generate`
- `npm run build`
- `npm test`
