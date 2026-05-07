# PeerTutoringPro

PeerTutoringPro is a React + Vite frontend with a Node.js + Express backend for tutor discovery, session booking, messaging, and profile management.

This project is now prepared for:
- Frontend on Vercel
- Database on Supabase PostgreSQL
- Backend on Render free web service

## Project Structure

- Root folder: Vite frontend
- `backend`: Express API
- `backend/scripts/migrate-sqlite-to-postgres.js`: one-time data migration from SQLite to PostgreSQL
- `android`: optional Capacitor Android wrapper

## Local Development

Prerequisites:
- Node.js 18+
- A PostgreSQL database URL

Frontend:
1. Run `npm install`
2. Create `.env.local`
3. Add:
   `VITE_API_URL=http://localhost:4000`
   `VITE_GEMINI_API_KEY=your_gemini_key`
4. Run `npm run dev`

Backend:
1. Open a second terminal
2. Run `cd backend`
3. Run `npm install`
4. Copy `backend/.env.example` to `.env` or set the variables in your terminal
5. Set `DATABASE_URL`
6. Run `npm start`

Local URLs:
- Frontend: `http://localhost:3000`
- Backend: `http://localhost:4000`

## Backend Environment Variables

Use [backend/.env.example](/c:/Users/Mawia/Documents/App/backend/.env.example).

Required:
- `DATABASE_URL`
- `FRONTEND_URL`
- `ALLOWED_ORIGINS`

Recommended:
- `COOKIE_SAME_SITE=None`
- `COOKIE_SECURE=true`
- `PORT=4000`

Optional for one-time migration:
- `SQLITE_DB_PATH=./database.db`

## SQLite To PostgreSQL Migration

If you already have data in `backend/database.db`, run this once after you create Supabase:

```powershell
cd backend
npm run migrate:sqlite
```

What it migrates:
- users
- sessions
- messages
- auth sessions

## Frontend Deployment

Deploy the project root to Vercel.

Build settings:
- Build command: `npm run build`
- Output directory: `dist`

Frontend environment variables:
- `VITE_API_URL=https://your-backend-name.onrender.com`
- `VITE_GEMINI_API_KEY=your_gemini_key`

This repo already includes [vercel.json](/c:/Users/Mawia/Documents/App/vercel.json) for:
- SPA rewrites
- Vite framework detection
- cache headers for built assets

## Backend Deployment

Deploy the `backend` service to Render free web service.

This repo already includes [render.yaml](/c:/Users/Mawia/Documents/App/render.yaml) with:
- free web service settings
- health check
- auto deploy
- environment variable placeholders

Backend production variables:
- `DATABASE_URL=your Supabase connection string`
- `FRONTEND_URL=https://your-project-name.vercel.app`
- `ALLOWED_ORIGINS=https://your-project-name.vercel.app`
- `COOKIE_SAME_SITE=None`
- `COOKIE_SECURE=true`

## Supabase

Use Supabase only for the PostgreSQL database.

You will need:
- Project URL
- Database password
- Connection string

Important:
- Use the PostgreSQL connection string from the Supabase dashboard
- For hosted deployment, use the connection string with SSL enabled

## First Deployment Checklist

1. Push this project to GitHub.
2. Create a Supabase project.
3. Copy the Supabase PostgreSQL connection string.
4. Deploy the backend to Render using [render.yaml](/c:/Users/Mawia/Documents/App/render.yaml).
5. Add `DATABASE_URL`, `FRONTEND_URL`, and `ALLOWED_ORIGINS` in Render.
6. Deploy the frontend to Vercel from the repo root.
7. Add `VITE_API_URL` and `VITE_GEMINI_API_KEY` in Vercel.
8. Open the live app and test registration, login, sessions, and chat.

## APK Conversion

This project can also be packaged as an Android app with Capacitor after hosting is live.

Commands:

```powershell
npm run build
npm run cap:sync
npm run cap:android
```

The APK will use the same hosted backend URL as the web app.

## Suggested Submission Setup

For your professor, share:
- the live Vercel frontend URL
- one or two test accounts
- a short note that the API is hosted separately
