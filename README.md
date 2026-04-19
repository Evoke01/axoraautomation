# Axora

Axora is an autonomous content distribution backend for creator video assets. This repository now contains:

- `backend/`: the TypeScript backend foundation for uploads, validation, planning, review gating, BullMQ orchestration, platform connection flows, metrics polling, optimization snapshots, and weekly opportunity reporting
- `frontend/`: the Axora dashboard UI, including live platform connection management in Settings

## Backend stack

- Fastify + TypeScript
- Prisma + PostgreSQL
- BullMQ + Redis
- S3-compatible object storage for raw assets
- Gemini for video analysis when enabled
- Groq for metadata generation, Mistral for metadata scoring, Cohere for timing decisions, Hugging Face for niche and engagement classification
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

Optional AI provider vars for the multi-agent content pipeline:

- `GEMINI_API_KEY`, `GEMINI_MODEL`
- `GROQ_API_KEY`, `GROQ_MODEL`
- `MISTRAL_API_KEY`, `MISTRAL_MODEL`
- `COHERE_API_KEY`, `COHERE_MODEL`
- `HF_API_TOKEN`, `HF_ZERO_SHOT_MODEL`

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
- Multi-agent asset analysis and metadata generation
- AI-assisted schedule selection with heuristic fallback
- Tier-based review gating
- YouTube publishing with token refresh and quota reservation
- Metrics snapshot polling and optimization recompute
- Weekly opportunity report generation
- Audit retention cleanup

## Multi-agent split

- `Gemini Flash`: analyzes video content, hook, vibe, and primary topics when a Gemini key is configured
- `Hugging Face Inference`: classifies niche and likely engagement band
- `Groq / Llama 3.3 70B`: writes metadata variants
- `Mistral small`: scores generated variants and pushes the best one to the front
- `Cohere Command-R`: recommends the publish slot from creator history and current asset context

If any provider key is missing, Axora falls back to heuristics instead of failing the asset pipeline.

## Verification

Backend checks completed:

- `npm run prisma:generate`
- `npm run build`
- `npm test`
