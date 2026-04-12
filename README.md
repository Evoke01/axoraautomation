# Axora

Axora is an autonomous content distribution backend for creator video assets. This repository now contains:

- `backend/`: the TypeScript backend foundation for uploads, validation, planning, review gating, BullMQ orchestration, YouTube connection flow, metrics polling, optimization snapshots, and weekly opportunity reporting
- `frontend/`: existing placeholder frontend code that has not yet been rebuilt for Axora

## Backend stack

- Fastify + TypeScript
- Prisma + PostgreSQL
- BullMQ + Redis
- S3-compatible object storage for raw assets
- YouTube OAuth + publishing adapter

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
