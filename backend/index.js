const express = require("express");
const cors = require("cors");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const app = express();
app.use(cors({
  origin: [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
    "http://localhost:3002",
    "http://127.0.0.1:3002",
    "http://localhost:3003",
    "http://127.0.0.1:3003",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://10.10.160.167:3000",
    "http://10.111.168.45:3000"
  ]
}));
app.use(express.json({ limit: "10mb" }));

const dbPath = path.join(__dirname, "database.db");
const db = new sqlite3.Database(dbPath);

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
  password: row.password || "",
  role: row.role,
  bio: row.bio || "",
  academicHistory: row.academicHistory || "",
  subjects: row.subjects ? JSON.parse(row.subjects) : [],
  rating: row.rating || 0,
  totalSessions: row.totalSessions || 0,
  isApproved: row.approved === 1,
  isActive: row.isActive !== 0,
  avatar: row.avatar || ""
});

const normalizeSession = (row) => ({
  ...row,
  duration: Number(row.duration || 60),
  rating: Number(row.rating || 0),
  cancellationReason: row.cancellationReason || "",
  rescheduleOptions: row.rescheduleOptions ? JSON.parse(row.rescheduleOptions) : []
});

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

app.post("/users", async (req, res) => {
  const { name, email, password, role } = req.body;

  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: "All fields are required" });
  }

  const approved = role === "TUTOR" ? 0 : 1;

  try {
    const result = await run(
      `INSERT INTO users
       (name, fullName, email, password, role, approved, isActive, bio, academicHistory, subjects, avatar, rating, totalSessions)
       VALUES (?, ?, ?, ?, ?, ?, 1, '', '', '[]', '', 0, 0)`,
      [name, name, email, password, role, approved]
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
  const { fullName, bio, academicHistory, subjects, avatar, isApproved, isActive, rating, totalSessions } = req.body;

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
        totalSessions = COALESCE(?, totalSessions)
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

app.post("/sessions", async (req, res) => {
  const { id, studentId, tutorId, subject, date, time, duration, status, notes, feedback, rating, createdAt, cancellationReason, rescheduleOptions } = req.body;

  if (!id || !studentId || !tutorId || !subject || !date || !time || !status || !createdAt) {
    return res.status(400).json({ error: "Missing required session fields" });
  }

  try {
    await run(
      `INSERT INTO sessions
       (id, studentId, tutorId, subject, date, time, duration, status, notes, feedback, rating, createdAt, cancellationReason, rescheduleOptions)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        studentId,
        tutorId,
        subject,
        date,
        time,
        duration || 60,
        status,
        notes || "",
        feedback || "",
        rating || 0,
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
  const { subject, date, time, duration, status, notes, feedback, rating, cancellationReason, rescheduleOptions } = req.body;

  try {
    await run(
      `UPDATE sessions SET
        subject = COALESCE(?, subject),
        date = COALESCE(?, date),
        time = COALESCE(?, time),
        duration = COALESCE(?, duration),
        status = COALESCE(?, status),
        notes = COALESCE(?, notes),
        feedback = COALESCE(?, feedback),
        rating = COALESCE(?, rating),
        cancellationReason = COALESCE(?, cancellationReason),
        rescheduleOptions = COALESCE(?, rescheduleOptions)
      WHERE id = ?`,
      [
        subject ?? null,
        date ?? null,
        time ?? null,
        duration ?? null,
        status ?? null,
        notes ?? null,
        feedback ?? null,
        rating ?? null,
        cancellationReason ?? null,
        Array.isArray(rescheduleOptions) ? JSON.stringify(rescheduleOptions) : null,
        req.params.id
      ]
    );

    const updated = await get("SELECT * FROM sessions WHERE id = ?", [req.params.id]);
    if (!updated) {
      return res.status(404).json({ error: "Session not found" });
    }
    const normalized = normalizeSession(updated);
    await refreshTutorStats(updated.tutorId);
    res.json(normalized);
  } catch (err) {
    res.status(500).json({ error: "Failed to update session" });
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

initializeDatabase()
  .then(() => {
    const PORT = 4000;
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Failed to initialize database:", err);
    process.exit(1);
  });
