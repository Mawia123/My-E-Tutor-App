const express = require("express");
const cors = require("cors");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const crypto = require("crypto");
const fs = require("fs");

const app = express();
const allowedOriginPatterns = [
  /^http:\/\/localhost(?::\d+)?$/,
  /^http:\/\/127\.0\.0\.1(?::\d+)?$/,
  /^http:\/\/10\.\d{1,3}\.\d{1,3}\.\d{1,3}(?::\d+)?$/,
  /^http:\/\/172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}(?::\d+)?$/,
  /^http:\/\/192\.168\.\d{1,3}\.\d{1,3}(?::\d+)?$/,
  /^https:\/\/.+\.vercel\.app$/,
  /^https:\/\/.+\.netlify\.app$/,
  /^https:\/\/.+\.onrender\.com$/
];
const configuredAllowedOrigins = (process.env.ALLOWED_ORIGINS || process.env.FRONTEND_URL || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const cookieSameSite = process.env.COOKIE_SAME_SITE || (configuredAllowedOrigins.length > 0 ? "None" : "Lax");
const useSecureCookies = process.env.COOKIE_SECURE === "true" || cookieSameSite.toLowerCase() === "none";
const dbPath = process.env.DB_PATH || path.join(__dirname, "database.db");

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

app.use(cors({
  origin(origin, callback) {
    if (!origin) {
      return callback(null, true);
    }

    const isConfiguredOrigin = configuredAllowedOrigins.includes(origin);
    const isAllowed = isConfiguredOrigin || allowedOriginPatterns.some((pattern) => pattern.test(origin));

    if (isAllowed) {
      return callback(null, true);
    }

    return callback(new Error("Not allowed by CORS"));
  },
  credentials: true
}));
app.use(express.json({ limit: "10mb" }));

const db = new sqlite3.Database(dbPath);
const SESSION_COOKIE_NAME = "peer_tutoring_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const run = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });

const all = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });

const get = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });

const safeAlter = async (sql) => {
  try {
    await run(sql);
  } catch (err) {
    if (!String(err.message || "").includes("duplicate column name")) {
      throw err;
    }
  }
};

const normalizeUser = (row) => ({
  id: String(row.id),
  fullName: row.fullName || row.name || "",
  email: row.email || "",
  role: row.role,
  bio: row.bio || "",
  academicHistory: row.academicHistory || "",
  subjects: row.subjects ? JSON.parse(row.subjects) : [],
  rating: row.rating || 0,
  totalSessions: row.totalSessions || 0,
  isApproved: row.approved === 1,
  minimumNoticeHours: Number(row.minimumNoticeHours || 6),
  acceptsShortNoticeRequests: row.acceptsShortNoticeRequests !== 0,
  isActive: row.isActive !== 0,
  avatar: row.avatar || ""
});

const hashPassword = (password) => {
  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${derivedKey}`;
};

const verifyPassword = (password, storedHash) => {
  if (!storedHash) {
    return false;
  }

  const [algorithm, salt, storedKey] = String(storedHash).split("$");

  if (algorithm !== "scrypt" || !salt || !storedKey) {
    return password === storedHash;
  }

  const derivedKey = crypto.scryptSync(password, salt, 64);
  const storedBuffer = Buffer.from(storedKey, "hex");

  if (storedBuffer.length !== derivedKey.length) {
    return false;
  }

  return crypto.timingSafeEqual(storedBuffer, derivedKey);
};

const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());

const hashSessionToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

const parseCookies = (cookieHeader = "") =>
  cookieHeader
    .split(";")
    .map(part => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const separatorIndex = part.indexOf("=");

      if (separatorIndex === -1) {
        return cookies;
      }

      const key = part.slice(0, separatorIndex).trim();
      const value = part.slice(separatorIndex + 1).trim();
      cookies[key] = decodeURIComponent(value);
      return cookies;
    }, {});

const serializeSessionCookie = (token, maxAgeMs = SESSION_TTL_MS) => {
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "HttpOnly",
    "Path=/",
    `SameSite=${cookieSameSite}`,
    `Max-Age=${Math.floor(maxAgeMs / 1000)}`
  ];

  if (useSecureCookies) {
    parts.push("Secure");
  }

  return parts.join("; ");
};

const clearSessionCookie = () => {
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    "HttpOnly",
    "Path=/",
    `SameSite=${cookieSameSite}`,
    "Max-Age=0"
  ];

  if (useSecureCookies) {
    parts.push("Secure");
  }

  return parts.join("; ");
};

const getSessionTokenFromRequest = (req) => {
  const cookies = parseCookies(req.headers.cookie || "");
  return cookies[SESSION_COOKIE_NAME] || null;
};

const getAuthenticatedUser = async (req) => {
  const token = getSessionTokenFromRequest(req);

  if (!token) {
    return null;
  }

  const session = await get(
    `SELECT sessions.*, users.*
     FROM sessions_auth sessions
     JOIN users ON users.id = sessions.userId
     WHERE sessions.tokenHash = ? AND sessions.expiresAt > ?`,
    [hashSessionToken(token), Date.now()]
  );

  return session ? normalizeUser(session) : null;
};

const normalizeSession = (row) => ({
  ...row,
  unit: row.unit || "",
  duration: Number(row.duration || 60),
  rating: Number(row.rating || 0),
  reviewIsAnonymous: row.reviewIsAnonymous === 1,
  cancellationReason: row.cancellationReason || "",
  rescheduleOptions: row.rescheduleOptions ? JSON.parse(row.rescheduleOptions) : []
});

const escapeHtml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const blockingStatuses = new Set(["PENDING", "ACCEPTED", "COMPLETED"]);
const shortNoticeWindowHours = 24;
const advanceBookingWindowMs = shortNoticeWindowHours * 60 * 60 * 1000;

const getSessionStartTime = (date, time) => new Date(`${date}T${time}:00`).getTime();

const isPastSessionTime = (date, time, now = Date.now()) => {
  const sessionStart = getSessionStartTime(date, time);

  if (Number.isNaN(sessionStart)) {
    return false;
  }

  return sessionStart < now;
};

const meetsAdvanceBookingWindow = (date, time, now = Date.now(), minimumLeadTimeMs = advanceBookingWindowMs) => {
  const sessionStart = getSessionStartTime(date, time);

  if (Number.isNaN(sessionStart)) {
    return false;
  }

  return sessionStart - now >= minimumLeadTimeMs;
};

const meetsMinimumNoticeHours = (date, time, minimumNoticeHours, now = Date.now()) =>
  meetsAdvanceBookingWindow(date, time, now, Number(minimumNoticeHours || 0) * 60 * 60 * 1000);

const isShortNoticeSession = (date, time, now = Date.now()) =>
  !isPastSessionTime(date, time, now) && !meetsAdvanceBookingWindow(date, time, now);

const sessionsOverlap = (first, second) => {
  if (first.date !== second.date) {
    return false;
  }

  const firstStart = getSessionStartTime(first.date, first.time);
  const secondStart = getSessionStartTime(second.date, second.time);

  if (Number.isNaN(firstStart) || Number.isNaN(secondStart)) {
    return false;
  }

  const firstEnd = firstStart + Number(first.duration || 60) * 60 * 1000;
  const secondEnd = secondStart + Number(second.duration || 60) * 60 * 1000;

  return firstStart < secondEnd && secondStart < firstEnd;
};

const findTutorBookingConflict = async ({ tutorId, date, time, duration, excludeSessionId }) => {
  const rows = await all(
    `SELECT * FROM sessions
     WHERE tutorId = ?
       AND date = ?
       AND status IN ('PENDING', 'ACCEPTED', 'COMPLETED')
       ${excludeSessionId ? "AND id != ?" : ""}`,
    excludeSessionId ? [tutorId, date, excludeSessionId] : [tutorId, date]
  );

  const requestedSession = { date, time, duration: Number(duration || 60) };

  return rows
    .map(normalizeSession)
    .find(existingSession => blockingStatuses.has(existingSession.status) && sessionsOverlap(existingSession, requestedSession));
};

const refreshTutorStats = async (tutorId) => {
  const stats = await get(
    `SELECT
      COUNT(CASE WHEN status IN ('ACCEPTED', 'COMPLETED') THEN 1 END) AS totalSessions,
      AVG(CASE WHEN rating IS NOT NULL AND rating > 0 THEN rating END) AS averageRating
     FROM sessions
     WHERE tutorId = ?`,
    [tutorId]
  );

  await run(
    `UPDATE users
     SET totalSessions = ?, rating = ?
     WHERE id = ?`,
    [
      stats?.totalSessions || 0,
      stats?.averageRating || 0,
      tutorId
    ]
  );
};

const initializeDatabase = async () => {
  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      email TEXT UNIQUE,
      password TEXT,
      role TEXT
    )
  `);

  await safeAlter("ALTER TABLE users ADD COLUMN fullName TEXT");
  await safeAlter("ALTER TABLE users ADD COLUMN approved INTEGER DEFAULT 0");
  await safeAlter("ALTER TABLE users ADD COLUMN isActive INTEGER DEFAULT 1");
  await safeAlter("ALTER TABLE users ADD COLUMN bio TEXT DEFAULT ''");
  await safeAlter("ALTER TABLE users ADD COLUMN academicHistory TEXT DEFAULT ''");
  await safeAlter("ALTER TABLE users ADD COLUMN subjects TEXT DEFAULT '[]'");
  await safeAlter("ALTER TABLE users ADD COLUMN avatar TEXT DEFAULT ''");
  await safeAlter("ALTER TABLE users ADD COLUMN rating REAL DEFAULT 0");
  await safeAlter("ALTER TABLE users ADD COLUMN totalSessions INTEGER DEFAULT 0");
  await safeAlter("ALTER TABLE users ADD COLUMN minimumNoticeHours INTEGER DEFAULT 6");
  await safeAlter("ALTER TABLE users ADD COLUMN acceptsShortNoticeRequests INTEGER DEFAULT 1");
  await safeAlter("ALTER TABLE users ADD COLUMN passwordHash TEXT DEFAULT ''");
  await run("UPDATE users SET approved = 1 WHERE role = 'TUTOR' AND COALESCE(approved, 0) = 0");

  await run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      studentId TEXT NOT NULL,
      tutorId TEXT NOT NULL,
      subject TEXT NOT NULL,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      duration INTEGER DEFAULT 60,
      status TEXT NOT NULL,
      notes TEXT DEFAULT '',
      feedback TEXT DEFAULT '',
      rating REAL DEFAULT 0,
      createdAt INTEGER NOT NULL
    )
  `);
  await safeAlter("ALTER TABLE sessions ADD COLUMN cancellationReason TEXT DEFAULT ''");
  await safeAlter("ALTER TABLE sessions ADD COLUMN rescheduleOptions TEXT DEFAULT '[]'");
  await safeAlter("ALTER TABLE sessions ADD COLUMN unit TEXT DEFAULT ''");
  await safeAlter("ALTER TABLE sessions ADD COLUMN reviewIsAnonymous INTEGER DEFAULT 0");

  await run(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      senderId TEXT NOT NULL,
      receiverId TEXT NOT NULL,
      text TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      read INTEGER DEFAULT 0
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS sessions_auth (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      tokenHash TEXT NOT NULL UNIQUE,
      createdAt INTEGER NOT NULL,
      expiresAt INTEGER NOT NULL
    )
  `);

  try {
    await run(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique_normalized
      ON users(LOWER(TRIM(email)))
    `);
  } catch (err) {
    console.warn("Could not create normalized unique email index. Clean duplicate emails first.", err.message);
  }

  await run("DELETE FROM sessions_auth WHERE expiresAt <= ?", [Date.now()]);

  console.log("Database initialized successfully");
};

app.get("/", (req, res) => {
  res.json({ message: "Backend running" });
});

app.get("/users", async (req, res) => {
  try {
    const rows = await all("SELECT * FROM users ORDER BY id DESC");
    res.json(rows.map(normalizeUser));
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

app.get("/users-preview", async (req, res) => {
  try {
    const rows = await all("SELECT * FROM users ORDER BY id DESC");
    const users = rows.map(normalizeUser);

    const cards = users.map(user => `
      <article class="card">
        <div class="avatar-wrap">
          ${
            user.avatar
              ? `<img src="${escapeHtml(user.avatar)}" alt="${escapeHtml(user.fullName)}" class="avatar" />`
              : `<div class="avatar placeholder">No Image</div>`
          }
        </div>
        <div class="meta">
          <h2>${escapeHtml(user.fullName || "Unnamed User")}</h2>
          <p><strong>Role:</strong> ${escapeHtml(user.role)}</p>
          <p><strong>Email:</strong> ${escapeHtml(user.email)}</p>
          <p><strong>Bio:</strong> ${escapeHtml(user.bio || "No bio")}</p>
          <p><strong>Academic History:</strong> ${escapeHtml(user.academicHistory || "No academic history")}</p>
          <p><strong>Subjects:</strong> ${escapeHtml((user.subjects || []).join(", ") || "None")}</p>
        </div>
      </article>
    `).join("");

    res.type("html").send(`
      <!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>Users Preview</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              margin: 0;
              padding: 24px;
              background: #f5f7fb;
              color: #1f2937;
            }
            h1 {
              margin: 0 0 8px;
            }
            .subtle {
              color: #6b7280;
              margin-bottom: 24px;
            }
            .grid {
              display: grid;
              grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
              gap: 16px;
            }
            .card {
              background: white;
              border-radius: 18px;
              padding: 18px;
              box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
              border: 1px solid #e5e7eb;
            }
            .avatar-wrap {
              margin-bottom: 14px;
            }
            .avatar {
              width: 96px;
              height: 96px;
              border-radius: 18px;
              object-fit: cover;
              display: block;
              background: #ecfdf5;
              border: 1px solid #d1fae5;
            }
            .placeholder {
              display: flex;
              align-items: center;
              justify-content: center;
              color: #9ca3af;
              font-size: 12px;
              font-weight: bold;
            }
            .meta h2 {
              margin: 0 0 10px;
            }
            .meta p {
              margin: 6px 0;
              line-height: 1.4;
              word-break: break-word;
            }
          </style>
        </head>
        <body>
          <h1>Users Preview</h1>
          <p class="subtle">Open <code>/users</code> for raw JSON, or use this page to preview avatar images.</p>
          <section class="grid">${cards}</section>
        </body>
      </html>
    `);
  } catch (err) {
    res.status(500).send("Failed to render users preview");
  }
});

app.get("/users/:id", async (req, res) => {
  try {
    const row = await get("SELECT * FROM users WHERE id = ?", [req.params.id]);
    if (!row) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json(normalizeUser(row));
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

app.get("/auth/me", async (req, res) => {
  try {
    const user = await getAuthenticatedUser(req);

    if (!user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    return res.json(user);
  } catch (err) {
    return res.status(500).json({ error: "Failed to restore session" });
  }
});

app.post("/auth/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  try {
    const user = await get("SELECT * FROM users WHERE email = ?", [email]);

    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const storedSecret = user.passwordHash || user.password || "";
    const isValidPassword = verifyPassword(password, storedSecret);

    if (!isValidPassword) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    if (!String(user.passwordHash || "").startsWith("scrypt$")) {
      await run("UPDATE users SET passwordHash = ?, password = '' WHERE id = ?", [hashPassword(password), user.id]);
    }

    await run("DELETE FROM sessions_auth WHERE userId = ? OR expiresAt <= ?", [user.id, Date.now()]);

    const token = crypto.randomBytes(32).toString("hex");
    const sessionId = crypto.randomUUID();
    const now = Date.now();
    const expiresAt = now + SESSION_TTL_MS;

    await run(
      `INSERT INTO sessions_auth (id, userId, tokenHash, createdAt, expiresAt)
       VALUES (?, ?, ?, ?, ?)`,
      [sessionId, user.id, hashSessionToken(token), now, expiresAt]
    );

    const refreshedUser = await get("SELECT * FROM users WHERE id = ?", [user.id]);
    res.setHeader("Set-Cookie", serializeSessionCookie(token));
    return res.json(normalizeUser(refreshedUser));
  } catch (err) {
    return res.status(500).json({ error: "Failed to sign in" });
  }
});

app.post("/auth/logout", async (req, res) => {
  try {
    const token = getSessionTokenFromRequest(req);

    if (token) {
      await run("DELETE FROM sessions_auth WHERE tokenHash = ?", [hashSessionToken(token)]);
    }

    res.setHeader("Set-Cookie", clearSessionCookie());
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: "Failed to sign out" });
  }
});

app.post("/users", async (req, res) => {
  const { name, email, password, role } = req.body;

  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: "All fields are required" });
  }

  if (!isValidEmail(email)) {
    return res.status(400).json({ error: "Please enter a valid email address" });
  }

  if (String(password).length < 4) {
    return res.status(400).json({ error: "Password must be at least 4 characters" });
  }

  const approved = 1;

  try {
    const passwordHash = hashPassword(password);
    const result = await run(
      `INSERT INTO users
       (name, fullName, email, password, passwordHash, role, approved, isActive, bio, academicHistory, subjects, avatar, rating, totalSessions)
       VALUES (?, ?, ?, '', ?, ?, ?, 1, '', '', '[]', '', 0, 0)`,
      [name, name, email, passwordHash, role, approved]
    );

    const created = await get("SELECT * FROM users WHERE id = ?", [result.lastID]);
    res.status(201).json(normalizeUser(created));
  } catch (err) {
    if (String(err.message || "").includes("UNIQUE")) {
      return res.status(409).json({ error: "Email already exists" });
    }
    res.status(500).json({ error: "Database error" });
  }
});

app.patch("/users/:id", async (req, res) => {
  const { fullName, bio, academicHistory, subjects, avatar, isApproved, isActive, rating, totalSessions, minimumNoticeHours, acceptsShortNoticeRequests } = req.body;

  try {
    await run(
      `UPDATE users SET
        fullName = COALESCE(?, fullName, name),
        name = COALESCE(?, name),
        bio = COALESCE(?, bio),
        academicHistory = COALESCE(?, academicHistory),
        subjects = COALESCE(?, subjects),
        avatar = COALESCE(?, avatar),
        approved = COALESCE(?, approved),
        isActive = COALESCE(?, isActive),
        rating = COALESCE(?, rating),
        totalSessions = COALESCE(?, totalSessions),
        minimumNoticeHours = COALESCE(?, minimumNoticeHours),
        acceptsShortNoticeRequests = COALESCE(?, acceptsShortNoticeRequests)
      WHERE id = ?`,
      [
        fullName ?? null,
        fullName ?? null,
        bio ?? null,
        academicHistory ?? null,
        Array.isArray(subjects) ? JSON.stringify(subjects) : null,
        avatar ?? null,
        typeof isApproved === "boolean" ? (isApproved ? 1 : 0) : null,
        typeof isActive === "boolean" ? (isActive ? 1 : 0) : null,
        rating ?? null,
        totalSessions ?? null,
        typeof minimumNoticeHours === "number" ? minimumNoticeHours : null,
        typeof acceptsShortNoticeRequests === "boolean" ? (acceptsShortNoticeRequests ? 1 : 0) : null,
        req.params.id
      ]
    );

    const updated = await get("SELECT * FROM users WHERE id = ?", [req.params.id]);
    if (!updated) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json(normalizeUser(updated));
  } catch (err) {
    res.status(500).json({ error: "Failed to update user" });
  }
});

app.get("/tutors", async (req, res) => {
  try {
    const rows = await all("SELECT * FROM users WHERE role = 'TUTOR' AND approved = 1 AND isActive = 1 ORDER BY id DESC");
    res.json(rows.map(normalizeUser));
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch tutors" });
  }
});

app.get("/sessions", async (req, res) => {
  try {
    const rows = await all("SELECT * FROM sessions ORDER BY createdAt DESC");
    res.json(rows.map(normalizeSession));
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch sessions" });
  }
});

app.post("/sessions/check-conflict", async (req, res) => {
  const { tutorId, date, time, duration, excludeSessionId } = req.body;

  if (!tutorId || !date || !time) {
    return res.status(400).json({ error: "Missing required slot fields" });
  }

  try {
    const conflictingSession = await findTutorBookingConflict({
      tutorId,
      date,
      time,
      duration,
      excludeSessionId
    });

    return res.json({
      hasConflict: Boolean(conflictingSession),
      conflict: conflictingSession ? normalizeSession(conflictingSession) : null
    });
  } catch (err) {
    return res.status(500).json({ error: "Failed to validate slot" });
  }
});

app.post("/sessions", async (req, res) => {
  const { id, studentId, tutorId, subject, unit, date, time, duration, status, notes, feedback, rating, reviewIsAnonymous, createdAt, cancellationReason, rescheduleOptions } = req.body;

  if (!id || !studentId || !tutorId || !subject || !date || !time || !status || !createdAt) {
    return res.status(400).json({ error: "Missing required session fields" });
  }

  try {
    const tutor = await get("SELECT * FROM users WHERE id = ?", [tutorId]);

    if (!tutor) {
      return res.status(404).json({ error: "Tutor not found" });
    }

    if (isPastSessionTime(date, time)) {
      return res.status(400).json({ error: "Sessions cannot be booked in the past" });
    }

    if (!meetsMinimumNoticeHours(date, time, tutor.minimumNoticeHours || 6)) {
      return res.status(400).json({ error: `This tutor requires at least ${tutor.minimumNoticeHours || 6} hours notice` });
    }

    if (isShortNoticeSession(date, time) && tutor.acceptsShortNoticeRequests === 0) {
      return res.status(400).json({ error: "This tutor does not accept short-notice requests" });
    }

    const conflictingSession = await findTutorBookingConflict({ tutorId, date, time, duration });

    if (conflictingSession) {
      return res.status(409).json({
        error: "Tutor is already booked for that time slot",
        conflict: normalizeSession(conflictingSession)
      });
    }

    await run(
      `INSERT INTO sessions
       (id, studentId, tutorId, subject, unit, date, time, duration, status, notes, feedback, rating, reviewIsAnonymous, createdAt, cancellationReason, rescheduleOptions)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        studentId,
        tutorId,
        subject,
        unit || "",
        date,
        time,
        duration || 60,
        status,
        notes || "",
        feedback || "",
        rating || 0,
        reviewIsAnonymous ? 1 : 0,
        createdAt,
        cancellationReason || "",
        Array.isArray(rescheduleOptions) ? JSON.stringify(rescheduleOptions) : "[]"
      ]
    );

    const created = await get("SELECT * FROM sessions WHERE id = ?", [id]);
    await refreshTutorStats(tutorId);
    res.status(201).json(normalizeSession(created));
  } catch (err) {
    res.status(500).json({ error: "Failed to create session" });
  }
});

app.patch("/sessions/:id", async (req, res) => {
  const { subject, unit, date, time, duration, status, notes, feedback, rating, reviewIsAnonymous, cancellationReason, rescheduleOptions } = req.body;

  try {
    const existingSession = await get("SELECT * FROM sessions WHERE id = ?", [req.params.id]);

    if (!existingSession) {
      return res.status(404).json({ error: "Session not found" });
    }

    const nextSession = {
      ...normalizeSession(existingSession),
      date: date ?? existingSession.date,
      time: time ?? existingSession.time,
      duration: Number(duration ?? existingSession.duration ?? 60),
      status: status ?? existingSession.status
    };
    const isScheduleUpdate =
      subject !== undefined ||
      unit !== undefined ||
      date !== undefined ||
      time !== undefined ||
      duration !== undefined ||
      status !== undefined ||
      notes !== undefined ||
      cancellationReason !== undefined ||
      rescheduleOptions !== undefined;

    const tutor = await get("SELECT * FROM users WHERE id = ?", [existingSession.tutorId]);

    if (isScheduleUpdate && blockingStatuses.has(nextSession.status) && isPastSessionTime(nextSession.date, nextSession.time)) {
      return res.status(400).json({ error: "Sessions cannot be scheduled in the past" });
    }

    if (isScheduleUpdate && blockingStatuses.has(nextSession.status) && tutor && !meetsMinimumNoticeHours(nextSession.date, nextSession.time, tutor.minimumNoticeHours || 6)) {
      return res.status(400).json({ error: `This tutor requires at least ${tutor.minimumNoticeHours || 6} hours notice` });
    }

    if (isScheduleUpdate && blockingStatuses.has(nextSession.status) && tutor && isShortNoticeSession(nextSession.date, nextSession.time) && tutor.acceptsShortNoticeRequests === 0) {
      return res.status(400).json({ error: "This tutor does not accept short-notice requests" });
    }

    if (isScheduleUpdate && blockingStatuses.has(nextSession.status)) {
      const conflictingSession = await findTutorBookingConflict({
        tutorId: existingSession.tutorId,
        date: nextSession.date,
        time: nextSession.time,
        duration: nextSession.duration,
        excludeSessionId: req.params.id
      });

      if (conflictingSession) {
        return res.status(409).json({
          error: "Tutor is already booked for that time slot",
          conflict: normalizeSession(conflictingSession)
        });
      }
    }

    await run(
      `UPDATE sessions SET
        subject = COALESCE(?, subject),
        unit = COALESCE(?, unit),
        date = COALESCE(?, date),
        time = COALESCE(?, time),
        duration = COALESCE(?, duration),
        status = COALESCE(?, status),
        notes = COALESCE(?, notes),
        feedback = COALESCE(?, feedback),
        rating = COALESCE(?, rating),
        reviewIsAnonymous = COALESCE(?, reviewIsAnonymous),
        cancellationReason = COALESCE(?, cancellationReason),
        rescheduleOptions = COALESCE(?, rescheduleOptions)
      WHERE id = ?`,
      [
        subject ?? null,
        unit ?? null,
        date ?? null,
        time ?? null,
        duration ?? null,
        status ?? null,
        notes ?? null,
        feedback ?? null,
        rating ?? null,
        typeof reviewIsAnonymous === "boolean" ? (reviewIsAnonymous ? 1 : 0) : null,
        cancellationReason ?? null,
        Array.isArray(rescheduleOptions) ? JSON.stringify(rescheduleOptions) : null,
        req.params.id
      ]
    );

    const updated = await get("SELECT * FROM sessions WHERE id = ?", [req.params.id]);
    const normalized = normalizeSession(updated);
    await refreshTutorStats(updated.tutorId);
    res.json(normalized);
  } catch (err) {
    res.status(500).json({ error: "Failed to update session" });
  }
});

app.delete("/sessions/:id", async (req, res) => {
  try {
    const existingSession = await get("SELECT * FROM sessions WHERE id = ?", [req.params.id]);

    if (!existingSession) {
      return res.status(404).json({ error: "Session not found" });
    }

    await run("DELETE FROM sessions WHERE id = ?", [req.params.id]);
    await refreshTutorStats(existingSession.tutorId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete session" });
  }
});

app.get("/messages", async (req, res) => {
  try {
    const rows = await all("SELECT * FROM messages ORDER BY timestamp ASC");
    res.json(rows.map((row) => ({ ...row, read: row.read === 1 })));
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch messages" });
  }
});

app.post("/messages", async (req, res) => {
  const { id, senderId, receiverId, text, timestamp, read } = req.body;

  if (!id || !senderId || !receiverId || !text || !timestamp) {
    return res.status(400).json({ error: "Missing required message fields" });
  }

  try {
    await run(
      `INSERT INTO messages (id, senderId, receiverId, text, timestamp, read)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, senderId, receiverId, text, timestamp, read ? 1 : 0]
    );

    const created = await get("SELECT * FROM messages WHERE id = ?", [id]);
    res.status(201).json({ ...created, read: created.read === 1 });
  } catch (err) {
    res.status(500).json({ error: "Failed to create message" });
  }
});

app.patch("/messages/:id", async (req, res) => {
  const { text, read } = req.body;

  try {
    await run(
      `UPDATE messages SET
        text = COALESCE(?, text),
        read = COALESCE(?, read)
      WHERE id = ?`,
      [
        text ?? null,
        typeof read === "boolean" ? (read ? 1 : 0) : null,
        req.params.id
      ]
    );

    const updated = await get("SELECT * FROM messages WHERE id = ?", [req.params.id]);
    if (!updated) {
      return res.status(404).json({ error: "Message not found" });
    }

    res.json({ ...updated, read: updated.read === 1 });
  } catch (err) {
    res.status(500).json({ error: "Failed to update message" });
  }
});

initializeDatabase()
  .then(() => {
    const PORT = Number(process.env.PORT || 4000);
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Failed to initialize database:", err);
    process.exit(1);
  });
