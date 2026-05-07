const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const { query, get, all } = require("./db");
const { ensureSchema } = require("./schema");

const app = express();

const allowedOriginPatterns = [
  /^http:\/\/localhost(?::\d+)?$/,
  /^http:\/\/127\.0\.0\.1(?::\d+)?$/,
  /^http:\/\/10\.\d{1,3}\.\d{1,3}\.\d{1,3}(?::\d+)?$/,
  /^http:\/\/172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}(?::\d+)?$/,
  /^http:\/\/192\.168\.\d{1,3}\.\d{1,3}(?::\d+)?$/,
  /^https:\/\/.+\.vercel\.app$/,
  /^https:\/\/.+\.netlify\.app$/,
  /^https:\/\/.+\.onrender\.com$/,
];

const configuredAllowedOrigins = (process.env.ALLOWED_ORIGINS || process.env.FRONTEND_URL || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const cookieSameSite = process.env.COOKIE_SAME_SITE || (configuredAllowedOrigins.length > 0 ? "None" : "Lax");
const useSecureCookies = process.env.COOKIE_SECURE === "true" || cookieSameSite.toLowerCase() === "none";

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
  credentials: true,
}));

app.use(express.json({ limit: "10mb" }));

const SESSION_COOKIE_NAME = "peer_tutoring_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const normalizeJsonArray = (value) => {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  return [];
};

const normalizeUser = (row) => ({
  id: String(row.id),
  fullName: row.full_name || row.fullName || row.name || "",
  email: row.email || "",
  role: row.role,
  bio: row.bio || "",
  academicHistory: row.academic_history || row.academicHistory || "",
  subjects: normalizeJsonArray(row.subjects),
  rating: Number(row.rating || 0),
  totalSessions: Number(row.total_sessions ?? row.totalSessions ?? 0),
  isApproved: row.approved === true || row.isApproved === true,
  minimumNoticeHours: Number(row.minimum_notice_hours ?? row.minimumNoticeHours ?? 6),
  acceptsShortNoticeRequests: row.accepts_short_notice_requests !== false && row.acceptsShortNoticeRequests !== false,
  isActive: row.is_active !== false && row.isActive !== false,
  avatar: row.avatar || "",
});

const normalizeSession = (row) => ({
  id: String(row.id),
  studentId: String(row.student_id ?? row.studentId),
  tutorId: String(row.tutor_id ?? row.tutorId),
  subject: row.subject || "",
  unit: row.unit || "",
  date: row.date || "",
  time: row.time || "",
  duration: Number(row.duration || 60),
  status: row.status,
  notes: row.notes || "",
  feedback: row.feedback || "",
  rating: Number(row.rating || 0),
  reviewIsAnonymous: row.review_is_anonymous === true || row.reviewIsAnonymous === true,
  cancellationReason: row.cancellation_reason || row.cancellationReason || "",
  rescheduleOptions: normalizeJsonArray(row.reschedule_options ?? row.rescheduleOptions),
  createdAt: Number(row.created_at ?? row.createdAt ?? Date.now()),
});

const normalizeMessage = (row) => ({
  id: String(row.id),
  senderId: String(row.sender_id ?? row.senderId),
  receiverId: String(row.receiver_id ?? row.receiverId),
  text: row.text || "",
  timestamp: Number(row.timestamp || 0),
  read: row.read === true,
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
    .map((part) => part.trim())
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
    `Max-Age=${Math.floor(maxAgeMs / 1000)}`,
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
    "Max-Age=0",
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

  const user = await get(`
    SELECT users.*
    FROM sessions_auth
    JOIN users ON users.id = sessions_auth.user_id
    WHERE sessions_auth.token_hash = $1
      AND sessions_auth.expires_at > $2
  `, [hashSessionToken(token), Date.now()]);

  return user ? normalizeUser(user) : null;
};

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
  const params = [String(tutorId), date];
  let queryText = `
    SELECT *
    FROM sessions
    WHERE tutor_id = $1
      AND date = $2
      AND status IN ('PENDING', 'ACCEPTED', 'COMPLETED')
  `;

  if (excludeSessionId) {
    params.push(String(excludeSessionId));
    queryText += ` AND id != $3`;
  }

  const rows = await all(queryText, params);
  const requestedSession = { date, time, duration: Number(duration || 60) };

  return rows
    .map(normalizeSession)
    .find((existingSession) => blockingStatuses.has(existingSession.status) && sessionsOverlap(existingSession, requestedSession));
};

const refreshTutorStats = async (tutorId) => {
  const stats = await get(`
    SELECT
      COUNT(*) FILTER (WHERE status IN ('ACCEPTED', 'COMPLETED')) AS total_sessions,
      AVG(NULLIF(rating, 0)) AS average_rating
    FROM sessions
    WHERE tutor_id = $1
  `, [String(tutorId)]);

  await query(`
    UPDATE users
    SET total_sessions = $1,
        rating = $2
    WHERE id = $3
  `, [
    Number(stats?.total_sessions || 0),
    Number(stats?.average_rating || 0),
    String(tutorId),
  ]);
};

app.get("/", (req, res) => {
  res.json({ message: "Backend running" });
});

app.get("/users", async (req, res) => {
  try {
    const rows = await all("SELECT * FROM users ORDER BY id DESC");
    res.json(rows.map(normalizeUser));
  } catch {
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

app.get("/users-preview", async (req, res) => {
  try {
    const rows = await all("SELECT * FROM users ORDER BY id DESC");
    const users = rows.map(normalizeUser);

    const cards = users.map((user) => `
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
            body { font-family: Arial, sans-serif; margin: 0; padding: 24px; background: #f5f7fb; color: #1f2937; }
            h1 { margin: 0 0 8px; }
            .subtle { color: #6b7280; margin-bottom: 24px; }
            .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; }
            .card { background: white; border-radius: 18px; padding: 18px; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08); border: 1px solid #e5e7eb; }
            .avatar-wrap { margin-bottom: 14px; }
            .avatar { width: 96px; height: 96px; border-radius: 18px; object-fit: cover; display: block; background: #ecfdf5; border: 1px solid #d1fae5; }
            .placeholder { display: flex; align-items: center; justify-content: center; color: #9ca3af; font-size: 12px; font-weight: bold; }
            .meta h2 { margin: 0 0 10px; }
            .meta p { margin: 6px 0; line-height: 1.4; word-break: break-word; }
          </style>
        </head>
        <body>
          <h1>Users Preview</h1>
          <p class="subtle">Open <code>/users</code> for raw JSON, or use this page to preview avatar images.</p>
          <section class="grid">${cards}</section>
        </body>
      </html>
    `);
  } catch {
    res.status(500).send("Failed to render users preview");
  }
});

app.get("/users/:id", async (req, res) => {
  try {
    const row = await get("SELECT * FROM users WHERE id = $1", [String(req.params.id)]);

    if (!row) {
      return res.status(404).json({ error: "User not found" });
    }

    return res.json(normalizeUser(row));
  } catch {
    return res.status(500).json({ error: "Failed to fetch user" });
  }
});

app.get("/auth/me", async (req, res) => {
  try {
    const user = await getAuthenticatedUser(req);

    if (!user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    return res.json(user);
  } catch {
    return res.status(500).json({ error: "Failed to restore session" });
  }
});

app.post("/auth/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  try {
    const user = await get(`
      SELECT *
      FROM users
      WHERE LOWER(TRIM(email)) = LOWER(TRIM($1))
    `, [email]);

    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const storedSecret = user.password_hash || user.password || "";
    const isValidPassword = verifyPassword(password, storedSecret);

    if (!isValidPassword) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    if (!String(user.password_hash || "").startsWith("scrypt$")) {
      await query(`
        UPDATE users
        SET password_hash = $1,
            password = ''
        WHERE id = $2
      `, [hashPassword(password), user.id]);
    }

    await query(`
      DELETE FROM sessions_auth
      WHERE user_id = $1 OR expires_at <= $2
    `, [user.id, Date.now()]);

    const token = crypto.randomBytes(32).toString("hex");
    const sessionId = crypto.randomUUID();
    const now = Date.now();
    const expiresAt = now + SESSION_TTL_MS;

    await query(`
      INSERT INTO sessions_auth (id, user_id, token_hash, created_at, expires_at)
      VALUES ($1, $2, $3, $4, $5)
    `, [sessionId, user.id, hashSessionToken(token), now, expiresAt]);

    const refreshedUser = await get("SELECT * FROM users WHERE id = $1", [user.id]);
    res.setHeader("Set-Cookie", serializeSessionCookie(token));
    return res.json(normalizeUser(refreshedUser));
  } catch {
    return res.status(500).json({ error: "Failed to sign in" });
  }
});

app.post("/auth/logout", async (req, res) => {
  try {
    const token = getSessionTokenFromRequest(req);

    if (token) {
      await query("DELETE FROM sessions_auth WHERE token_hash = $1", [hashSessionToken(token)]);
    }

    res.setHeader("Set-Cookie", clearSessionCookie());
    return res.json({ success: true });
  } catch {
    return res.status(500).json({ error: "Failed to sign out" });
  }
});

app.post("/auth/forgot-password", async (req, res) => {
  const { email, newPassword } = req.body;

  if (!email || !newPassword) {
    return res.status(400).json({ error: "Email and new password are required" });
  }

  if (!isValidEmail(email)) {
    return res.status(400).json({ error: "Please enter a valid email address" });
  }

  if (String(newPassword).length < 4) {
    return res.status(400).json({ error: "Password must be at least 4 characters" });
  }

  try {
    const updatedUser = await get(`
      UPDATE users
      SET password_hash = $1,
          password = ''
      WHERE LOWER(TRIM(email)) = LOWER(TRIM($2))
      RETURNING id
    `, [hashPassword(newPassword), email]);

    if (!updatedUser) {
      return res.status(404).json({ error: "No account was found for that email address" });
    }

    await query(`
      DELETE FROM sessions_auth
      WHERE user_id = $1
    `, [updatedUser.id]);

    return res.json({
      success: true,
      message: "Password reset successful. You can now sign in with your new password.",
    });
  } catch {
    return res.status(500).json({ error: "Failed to reset password" });
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

  try {
    const passwordHash = hashPassword(password);
    const created = await get(`
      INSERT INTO users (
        name,
        full_name,
        email,
        password,
        password_hash,
        role,
        approved,
        is_active,
        bio,
        academic_history,
        subjects,
        avatar,
        rating,
        total_sessions
      )
      VALUES ($1, $2, $3, '', $4, $5, TRUE, TRUE, '', '', '[]'::jsonb, '', 0, 0)
      RETURNING *
    `, [name, name, email, passwordHash, role]);

    return res.status(201).json(normalizeUser(created));
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ error: "Email already exists" });
    }

    return res.status(500).json({ error: "Database error" });
  }
});

app.patch("/users/:id", async (req, res) => {
  const {
    fullName,
    bio,
    academicHistory,
    subjects,
    avatar,
    isApproved,
    isActive,
    rating,
    totalSessions,
    minimumNoticeHours,
    acceptsShortNoticeRequests,
  } = req.body;

  try {
    const updated = await get(`
      UPDATE users
      SET full_name = COALESCE($1, full_name),
          name = COALESCE($2, name),
          bio = COALESCE($3, bio),
          academic_history = COALESCE($4, academic_history),
          subjects = COALESCE($5::jsonb, subjects),
          avatar = COALESCE($6, avatar),
          approved = COALESCE($7, approved),
          is_active = COALESCE($8, is_active),
          rating = COALESCE($9, rating),
          total_sessions = COALESCE($10, total_sessions),
          minimum_notice_hours = COALESCE($11, minimum_notice_hours),
          accepts_short_notice_requests = COALESCE($12, accepts_short_notice_requests)
      WHERE id = $13
      RETURNING *
    `, [
      fullName ?? null,
      fullName ?? null,
      bio ?? null,
      academicHistory ?? null,
      Array.isArray(subjects) ? JSON.stringify(subjects) : null,
      avatar ?? null,
      typeof isApproved === "boolean" ? isApproved : null,
      typeof isActive === "boolean" ? isActive : null,
      rating ?? null,
      totalSessions ?? null,
      typeof minimumNoticeHours === "number" ? minimumNoticeHours : null,
      typeof acceptsShortNoticeRequests === "boolean" ? acceptsShortNoticeRequests : null,
      String(req.params.id),
    ]);

    if (!updated) {
      return res.status(404).json({ error: "User not found" });
    }

    return res.json(normalizeUser(updated));
  } catch {
    return res.status(500).json({ error: "Failed to update user" });
  }
});

app.get("/tutors", async (req, res) => {
  try {
    const rows = await all(`
      SELECT *
      FROM users
      WHERE role = 'TUTOR' AND approved = TRUE AND is_active = TRUE
      ORDER BY id DESC
    `);

    return res.json(rows.map(normalizeUser));
  } catch {
    return res.status(500).json({ error: "Failed to fetch tutors" });
  }
});

app.get("/sessions", async (req, res) => {
  try {
    const rows = await all("SELECT * FROM sessions ORDER BY created_at DESC");
    return res.json(rows.map(normalizeSession));
  } catch {
    return res.status(500).json({ error: "Failed to fetch sessions" });
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
      excludeSessionId,
    });

    return res.json({
      hasConflict: Boolean(conflictingSession),
      conflict: conflictingSession || null,
    });
  } catch {
    return res.status(500).json({ error: "Failed to validate slot" });
  }
});

app.post("/sessions", async (req, res) => {
  const {
    id,
    studentId,
    tutorId,
    subject,
    unit,
    date,
    time,
    duration,
    status,
    notes,
    feedback,
    rating,
    reviewIsAnonymous,
    createdAt,
    cancellationReason,
    rescheduleOptions,
  } = req.body;

  if (!id || !studentId || !tutorId || !subject || !date || !time || !status || !createdAt) {
    return res.status(400).json({ error: "Missing required session fields" });
  }

  try {
    const tutor = await get("SELECT * FROM users WHERE id = $1", [String(tutorId)]);

    if (!tutor) {
      return res.status(404).json({ error: "Tutor not found" });
    }

    if (isPastSessionTime(date, time)) {
      return res.status(400).json({ error: "Sessions cannot be booked in the past" });
    }

    if (!meetsMinimumNoticeHours(date, time, tutor.minimum_notice_hours || 6)) {
      return res.status(400).json({ error: `This tutor requires at least ${tutor.minimum_notice_hours || 6} hours notice` });
    }

    if (isShortNoticeSession(date, time) && tutor.accepts_short_notice_requests === false) {
      return res.status(400).json({ error: "This tutor does not accept short-notice requests" });
    }

    const conflictingSession = await findTutorBookingConflict({ tutorId, date, time, duration });

    if (conflictingSession) {
      return res.status(409).json({
        error: "Tutor is already booked for that time slot",
        conflict: conflictingSession,
      });
    }

    const created = await get(`
      INSERT INTO sessions (
        id,
        student_id,
        tutor_id,
        subject,
        unit,
        date,
        time,
        duration,
        status,
        notes,
        feedback,
        rating,
        review_is_anonymous,
        created_at,
        cancellation_reason,
        reschedule_options
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb)
      RETURNING *
    `, [
      id,
      String(studentId),
      String(tutorId),
      subject,
      unit || "",
      date,
      time,
      duration || 60,
      status,
      notes || "",
      feedback || "",
      rating || 0,
      Boolean(reviewIsAnonymous),
      createdAt,
      cancellationReason || "",
      JSON.stringify(Array.isArray(rescheduleOptions) ? rescheduleOptions : []),
    ]);

    await refreshTutorStats(tutorId);
    return res.status(201).json(normalizeSession(created));
  } catch {
    return res.status(500).json({ error: "Failed to create session" });
  }
});

app.patch("/sessions/:id", async (req, res) => {
  const { subject, unit, date, time, duration, status, notes, feedback, rating, reviewIsAnonymous, cancellationReason, rescheduleOptions } = req.body;

  try {
    const existingSession = await get("SELECT * FROM sessions WHERE id = $1", [String(req.params.id)]);

    if (!existingSession) {
      return res.status(404).json({ error: "Session not found" });
    }

    const nextSession = {
      ...normalizeSession(existingSession),
      date: date ?? existingSession.date,
      time: time ?? existingSession.time,
      duration: Number(duration ?? existingSession.duration ?? 60),
      status: status ?? existingSession.status,
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

    const tutor = await get("SELECT * FROM users WHERE id = $1", [String(existingSession.tutor_id)]);

    if (isScheduleUpdate && blockingStatuses.has(nextSession.status) && isPastSessionTime(nextSession.date, nextSession.time)) {
      return res.status(400).json({ error: "Sessions cannot be scheduled in the past" });
    }

    if (isScheduleUpdate && blockingStatuses.has(nextSession.status) && tutor && !meetsMinimumNoticeHours(nextSession.date, nextSession.time, tutor.minimum_notice_hours || 6)) {
      return res.status(400).json({ error: `This tutor requires at least ${tutor.minimum_notice_hours || 6} hours notice` });
    }

    if (isScheduleUpdate && blockingStatuses.has(nextSession.status) && tutor && isShortNoticeSession(nextSession.date, nextSession.time) && tutor.accepts_short_notice_requests === false) {
      return res.status(400).json({ error: "This tutor does not accept short-notice requests" });
    }

    if (isScheduleUpdate && blockingStatuses.has(nextSession.status)) {
      const conflictingSession = await findTutorBookingConflict({
        tutorId: existingSession.tutor_id,
        date: nextSession.date,
        time: nextSession.time,
        duration: nextSession.duration,
        excludeSessionId: req.params.id,
      });

      if (conflictingSession) {
        return res.status(409).json({
          error: "Tutor is already booked for that time slot",
          conflict: conflictingSession,
        });
      }
    }

    const updated = await get(`
      UPDATE sessions
      SET subject = COALESCE($1, subject),
          unit = COALESCE($2, unit),
          date = COALESCE($3, date),
          time = COALESCE($4, time),
          duration = COALESCE($5, duration),
          status = COALESCE($6, status),
          notes = COALESCE($7, notes),
          feedback = COALESCE($8, feedback),
          rating = COALESCE($9, rating),
          review_is_anonymous = COALESCE($10, review_is_anonymous),
          cancellation_reason = COALESCE($11, cancellation_reason),
          reschedule_options = COALESCE($12::jsonb, reschedule_options)
      WHERE id = $13
      RETURNING *
    `, [
      subject ?? null,
      unit ?? null,
      date ?? null,
      time ?? null,
      duration ?? null,
      status ?? null,
      notes ?? null,
      feedback ?? null,
      rating ?? null,
      typeof reviewIsAnonymous === "boolean" ? reviewIsAnonymous : null,
      cancellationReason ?? null,
      Array.isArray(rescheduleOptions) ? JSON.stringify(rescheduleOptions) : null,
      String(req.params.id),
    ]);

    await refreshTutorStats(updated.tutor_id);
    return res.json(normalizeSession(updated));
  } catch {
    return res.status(500).json({ error: "Failed to update session" });
  }
});

app.delete("/sessions/:id", async (req, res) => {
  try {
    const existingSession = await get("SELECT * FROM sessions WHERE id = $1", [String(req.params.id)]);

    if (!existingSession) {
      return res.status(404).json({ error: "Session not found" });
    }

    await query("DELETE FROM sessions WHERE id = $1", [String(req.params.id)]);
    await refreshTutorStats(existingSession.tutor_id);
    return res.json({ success: true });
  } catch {
    return res.status(500).json({ error: "Failed to delete session" });
  }
});

app.get("/messages", async (req, res) => {
  try {
    const rows = await all("SELECT * FROM messages ORDER BY timestamp ASC");
    return res.json(rows.map(normalizeMessage));
  } catch {
    return res.status(500).json({ error: "Failed to fetch messages" });
  }
});

app.post("/messages", async (req, res) => {
  const { id, senderId, receiverId, text, timestamp, read } = req.body;

  if (!id || !senderId || !receiverId || !text || !timestamp) {
    return res.status(400).json({ error: "Missing required message fields" });
  }

  try {
    const created = await get(`
      INSERT INTO messages (id, sender_id, receiver_id, text, timestamp, read)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [
      id,
      String(senderId),
      String(receiverId),
      text,
      timestamp,
      Boolean(read),
    ]);

    return res.status(201).json(normalizeMessage(created));
  } catch {
    return res.status(500).json({ error: "Failed to create message" });
  }
});

app.patch("/messages/:id", async (req, res) => {
  const { text, read } = req.body;

  try {
    const updated = await get(`
      UPDATE messages
      SET text = COALESCE($1, text),
          read = COALESCE($2, read)
      WHERE id = $3
      RETURNING *
    `, [
      text ?? null,
      typeof read === "boolean" ? read : null,
      String(req.params.id),
    ]);

    if (!updated) {
      return res.status(404).json({ error: "Message not found" });
    }

    return res.json(normalizeMessage(updated));
  } catch {
    return res.status(500).json({ error: "Failed to update message" });
  }
});

ensureSchema()
  .then(() => {
    const PORT = Number(process.env.PORT || 4000);
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error("Failed to initialize database:", error);
    process.exit(1);
  });
