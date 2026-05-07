# PeerTutoringPro

PeerTutoringPro is a React + Vite frontend with an Express + SQLite backend for tutor discovery, session booking, messaging, and profile management.

## Local Development

Prerequisites:
- Node.js 18+

Frontend:
1. Install dependencies:
   `npm install`
2. Create `.env.local` with:
   `VITE_GEMINI_API_KEY=your_key_here`
3. Start the frontend:
   `npm run dev`

Backend:
1. Open a second terminal
2. Install backend dependencies:
   `cd backend`
   `npm install`
3. Start the backend:
   `npm start`

Local URLs:
- Frontend: `http://localhost:3000`
- Backend: `http://localhost:4000`

## Deploy Overview

Recommended setup:
- Frontend: Vercel or Netlify
- Backend: Render Web Service
- Database: SQLite on a Render persistent disk

Why this setup:
- The frontend is a static Vite app and deploys cleanly on Vercel/Netlify.
- The backend uses Express and SQLite, which fits Render well.
- Your app uses cookie-based login, so the hosted backend must allow your hosted frontend origin.

## Frontend Deployment

Deploy the project root as the frontend.

Build settings:
- Build command: `npm run build`
- Output directory: `dist`

Frontend environment variables:
- `VITE_API_URL=https://your-backend-name.onrender.com`
- `VITE_GEMINI_API_KEY=your_gemini_key`

Important:
- `VITE_GEMINI_API_KEY` is embedded into the frontend bundle and can be viewed by users. That is acceptable for a classroom demo, but for a stricter production setup you should move Gemini requests to the backend.
- `VITE_API_URL` must be set for any hosted or APK build. The frontend now only auto-falls back to `localhost` during local development.

## APK Conversion

This project can be packaged as an Android app with Capacitor after the hosted backend is ready.

Recommended order:
1. Deploy the backend to Render.
2. Deploy the frontend to Vercel or Netlify.
3. Set `VITE_API_URL` to the public backend URL.
4. Build the frontend with `npm run build`.
5. Sync the Android wrapper with `npm run cap:sync`.
6. Open the Android project with `npm run cap:android`.
7. Generate an APK from Android Studio.

Notes:
- The APK will still call your hosted backend, so your professor can use the same data from anywhere.
- Cookie-based login should be tested on a real Android device after hosting is live.
- You still need to run `npm install` once to download the Capacitor packages added in `package.json`.

### Vercel

Deploy the root folder and add the environment variables above in the Vercel project settings.

This repo already includes [vercel.json](/c:/Users/Mawia/Documents/App/vercel.json) for:
- SPA rewrites so direct links keep working
- Vite framework detection
- cache headers for built assets

### Netlify

Deploy the root folder and add the environment variables above in the Netlify site settings.

## Backend Deployment on Render

Create a Render Web Service from the `backend` folder or from this repo with `backend` set as the root directory.

Render settings:
- Runtime: `Node`
- Root Directory: `backend`
- Build Command: `npm install`
- Start Command: `npm start`

Backend environment variables:
- `FRONTEND_URL=https://your-frontend-domain.vercel.app`
- `ALLOWED_ORIGINS=https://your-frontend-domain.vercel.app`
- `COOKIE_SAME_SITE=None`
- `COOKIE_SECURE=true`
- `DB_PATH=/opt/render/project/src/data/database.db`

Persistent disk:
- Attach a persistent disk in Render
- Mount path: `/opt/render/project/src/data`

This repo already includes [render.yaml](/c:/Users/Mawia/Documents/App/render.yaml) for:
- the backend service definition
- a persistent SQLite disk mount
- health checks
- the required cookie/database environment defaults

You can also reference [backend/.env.example](/c:/Users/Mawia/Documents/App/backend/.env.example) when filling in Render environment variables.

Notes:
- `FRONTEND_URL` and `ALLOWED_ORIGINS` should match the exact public frontend origin.
- If you later add a custom domain, update both values.
- The backend already reads `PORT` from Render automatically.

## First Deployment Checklist

1. Push this project to GitHub.
2. Deploy the backend to Render using [render.yaml](/c:/Users/Mawia/Documents/App/render.yaml).
3. In Render, set `FRONTEND_URL` and `ALLOWED_ORIGINS` to your final frontend URL.
4. Wait for Render to assign a public backend URL such as `https://your-backend-name.onrender.com`.
5. Deploy the frontend to Vercel using [vercel.json](/c:/Users/Mawia/Documents/App/vercel.json).
6. In Vercel, set `VITE_API_URL` to the Render backend URL.
7. Set `VITE_GEMINI_API_KEY` in Vercel.
8. Redeploy the frontend after adding env vars.
9. Open the live app and test login, registration, sessions, and messaging.

## Recommended Production Values

Frontend on Vercel:
- `VITE_API_URL=https://your-backend-name.onrender.com`
- `VITE_GEMINI_API_KEY=your_gemini_key`

Backend on Render:
- `FRONTEND_URL=https://your-project-name.vercel.app`
- `ALLOWED_ORIGINS=https://your-project-name.vercel.app`
- `COOKIE_SAME_SITE=None`
- `COOKIE_SECURE=true`
- `DB_PATH=/opt/render/project/src/data/database.db`

## If Login Fails After Deploy

Check these first:
- `FRONTEND_URL` exactly matches the frontend URL, including `https://`
- `ALLOWED_ORIGINS` includes the frontend URL
- `COOKIE_SAME_SITE=None`
- `COOKIE_SECURE=true`
- The frontend is using the correct `VITE_API_URL`

## Suggested Submission Setup For Your Professor

For the smoothest review experience, give your professor:
- the live frontend URL
- a short demo video
- one or two test accounts
- a brief note that the backend is hosted on Render
