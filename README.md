# Final Destination Control Hub (Production Split Architecture)

This repo now supports a **split production deployment** for Arthvidya's event app:

- Frontend: **Vercel** (Next.js UI)
- Backend: **Render** (Express API + Socket.IO)
- ORM: **Prisma**
- DB: **Postgres in production** (with local SQLite fallback workflow)

## Architecture

### Frontend (Next.js)
- Pages/UI only.
- Calls API through `/api/*` paths.
- `next.config.js` rewrites `/api/*` to backend using `NEXT_PUBLIC_BACKEND_URL`.
- Socket client connects directly to backend via `NEXT_PUBLIC_SOCKET_URL` (`/socket.io`).

### Backend (Standalone)
- File: `backend/src/server.ts`
- Hosts:
  - Auth (admin + participant)
  - Question/quiz/session APIs
  - Participant management APIs
  - Session control APIs (start/launch/reveal/next/pause/resume/end)
  - Destination navigation API
  - Health endpoints
  - Socket.IO realtime events

## Auth Model

### Admin auth
- `POST /api/auth/admin-login` with `ADMIN_PASSWORD`
- Token is issued and stored (cookie + frontend local storage)
- Protected admin APIs require admin auth

### Participant auth
- Admin creates participant accounts (username/password + team mapping)
- Participant logs in via `POST /api/auth/participant-login`
- Backend enforces auth on join/answer actions
- Anonymous team-code only flow is no longer used for protected gameplay APIs

### Participant account model
- Prisma model: `ParticipantAccount`
- Fields: `username`, `teamCode`, `passwordHash`, `displayName`, `isActive`, `lastLoginAt`

## New/Updated Admin UI

- `/admin` now includes admin login and panel links
- `/admin/participants` added:
  - create participant logins
  - activate/deactivate accounts
  - team code mapping per account

## Participant flow

1. Open `/participant`
2. Login with participant credentials
3. App finds active session and performs authenticated join
4. Enter lobby/play flow
5. Answer submissions are authenticated and server-validated

## Core Realtime Events

- `session_updated`
- `question_started`
- `answer_stats_updated`
- `question_revealed`
- `leaderboard_updated`
- `destination_updated`

Rooms:
- `session:{sessionId}`
- `admin:{sessionId}` (admin join path)

## Scoring Modes

### CLASSIC
- Correct: time-weighted points
- Wrong/unanswered: 0

### BUDGET (DRY RUN)
- Initial budget: 10000
- Hint correct: +200
- Hint wrong: 0
- Main correct: +1000
- Main wrong: -250

## Local Setup

```powershell
cd e:\final-destination
npm install
npm run prisma:generate
npm run prisma:migrate
npm run seed:quiz
```

Run backend and frontend in separate terminals:

```powershell
# terminal 1
npm run backend:dev

# terminal 2
npm run dev:safe
```

Open:
- Frontend: `http://localhost:3000`
- Backend health: `http://localhost:4000/health`

Or run both together:

```powershell
npm.cmd run dev:all
```

## Environment Variables

Use `.env.local` for local dev and Vercel/Render env settings in production.

Required:

```env
DATABASE_URL="file:./dev.db"
SESSION_SECRET=...
JWT_SECRET=...
ADMIN_PASSWORD=kunal
DEFAULT_PARTICIPANT_PASSWORD=Team@12345

NEXT_PUBLIC_BACKEND_URL=http://localhost:4000
NEXT_PUBLIC_SOCKET_URL=http://localhost:4000

BACKEND_PORT=4000
BACKEND_CORS_ORIGINS=http://localhost:3000
```

## Production Postgres

- Production schema file: `prisma/schema.postgres.prisma`
- Commands:

```powershell
npm run prisma:generate:postgres
npm run prisma:migrate:postgres
# and on deploy pipeline:
npm run prisma:deploy:postgres
```

Set `DATABASE_URL` to your managed Postgres connection string in backend host env.

## Deployment (Recommended)

### Backend on Render
1. Create Web Service from this repo
2. Build command: `npm install && npm run prisma:generate:postgres`
3. Start command: `npm run backend:dev` (or compile+node start in prod image)
4. Set envs (`DATABASE_URL`, `JWT_SECRET`, `SESSION_SECRET`, `ADMIN_PASSWORD`, `BACKEND_CORS_ORIGINS`)

### Frontend on Vercel
1. Import same repo
2. Set envs:
   - `NEXT_PUBLIC_BACKEND_URL=https://<render-backend-domain>`
   - `NEXT_PUBLIC_SOCKET_URL=https://<render-backend-domain>`
3. Deploy

## Validation Run (latest)

Executed locally:
- `npm run prisma:generate` ✅
- `npm run prisma:migrate` ✅
- `npm run seed:quiz` ✅
- `npm run typecheck` ✅
- `npm run build` ✅

Backend smoke checks executed:
- `GET /health` ✅
- `POST /api/auth/admin-login` ✅
- `GET /api/admin/participants` (admin protected) ✅
- `POST /api/auth/participant-login` ✅
- session start/join/launch/answer/reveal flow ✅

## Notes

- Existing legacy Next `/app/api/*` routes remain in repo but frontend `/api/*` requests are rewritten to backend when `NEXT_PUBLIC_BACKEND_URL` is set.
- For event operations, use the split architecture (backend + frontend) with backend as source of truth.
