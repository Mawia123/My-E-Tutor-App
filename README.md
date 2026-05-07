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

### Vercel

Deploy the root folder and add the environment variables above in the Vercel project settings.

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

Notes:
- `FRONTEND_URL` and `ALLOWED_ORIGINS` should match the exact public frontend origin.
- If you later add a custom domain, update both values.
- The backend already reads `PORT` from Render automatically.

## First Deployment Checklist

1. Push this project to GitHub.
2. Deploy the backend to Render.
3. Add a persistent disk to the backend service.
4. Set the backend env vars in Render.
5. Deploy the frontend to Vercel or Netlify.
6. Set `VITE_API_URL` to the Render backend URL.
7. Set `VITE_GEMINI_API_KEY` in the frontend host.
8. Open the app and test login, registration, sessions, and messaging.

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
