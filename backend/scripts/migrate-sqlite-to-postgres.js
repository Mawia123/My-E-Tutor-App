const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const { pool, query } = require("../db");
const { ensureSchema } = require("../schema");

const sourceDbPath = process.env.SQLITE_DB_PATH || path.join(__dirname, "..", "database.db");
const sqliteDb = new sqlite3.Database(sourceDbPath);

const sqliteAll = (sql, params = []) =>
  new Promise((resolve, reject) => {
    sqliteDb.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });

const closeSqlite = () =>
  new Promise((resolve, reject) => {
    sqliteDb.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });

const toJsonString = (value, fallback = []) => {
  if (Array.isArray(value)) {
    return JSON.stringify(value);
  }

  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return JSON.stringify(Array.isArray(parsed) ? parsed : fallback);
    } catch {
      return JSON.stringify(fallback);
    }
  }

  return JSON.stringify(fallback);
};

const setSequence = async (tableName, columnName = "id") => {
  await query(`
    SELECT setval(
      pg_get_serial_sequence($1, $2),
      COALESCE((SELECT MAX(${columnName}) FROM ${tableName}), 1),
      TRUE
    )
  `, [tableName, columnName]);
};

const main = async () => {
  await ensureSchema();

  const users = await sqliteAll("SELECT * FROM users ORDER BY id ASC");
  const sessions = await sqliteAll("SELECT * FROM sessions ORDER BY createdAt ASC");
  const messages = await sqliteAll("SELECT * FROM messages ORDER BY timestamp ASC");
  const authSessions = await sqliteAll("SELECT * FROM sessions_auth ORDER BY createdAt ASC");

  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM sessions_auth");
    await client.query("DELETE FROM messages");
    await client.query("DELETE FROM sessions");
    await client.query("DELETE FROM users");

    for (const user of users) {
      await client.query(`
        INSERT INTO users (
          id, name, full_name, email, password, password_hash, role, approved, is_active,
          bio, academic_history, subjects, avatar, rating, total_sessions,
          minimum_notice_hours, accepts_short_notice_requests
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, $14, $15, $16, $17)
      `, [
        Number(user.id),
        user.name || "",
        user.fullName || user.name || "",
        user.email || "",
        user.password || "",
        user.passwordHash || "",
        user.role || "STUDENT",
        user.approved === 1,
        user.isActive !== 0,
        user.bio || "",
        user.academicHistory || "",
        toJsonString(user.subjects),
        user.avatar || "",
        Number(user.rating || 0),
        Number(user.totalSessions || 0),
        Number(user.minimumNoticeHours || 6),
        user.acceptsShortNoticeRequests !== 0,
      ]);
    }

    for (const session of sessions) {
      await client.query(`
        INSERT INTO sessions (
          id, student_id, tutor_id, subject, unit, date, time, duration, status,
          notes, feedback, rating, review_is_anonymous, created_at, cancellation_reason, reschedule_options
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb)
      `, [
        session.id,
        Number(session.studentId),
        Number(session.tutorId),
        session.subject || "",
        session.unit || "",
        session.date || "",
        session.time || "",
        Number(session.duration || 60),
        session.status || "PENDING",
        session.notes || "",
        session.feedback || "",
        Number(session.rating || 0),
        session.reviewIsAnonymous === 1,
        Number(session.createdAt || Date.now()),
        session.cancellationReason || "",
        toJsonString(session.rescheduleOptions),
      ]);
    }

    for (const message of messages) {
      await client.query(`
        INSERT INTO messages (id, sender_id, receiver_id, text, timestamp, read)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        message.id,
        Number(message.senderId),
        Number(message.receiverId),
        message.text || "",
        Number(message.timestamp || Date.now()),
        message.read === 1,
      ]);
    }

    for (const authSession of authSessions) {
      await client.query(`
        INSERT INTO sessions_auth (id, user_id, token_hash, created_at, expires_at)
        VALUES ($1, $2, $3, $4, $5)
      `, [
        authSession.id,
        Number(authSession.userId),
        authSession.tokenHash,
        Number(authSession.createdAt || Date.now()),
        Number(authSession.expiresAt || Date.now()),
      ]);
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  await setSequence("users");
  console.log(`Migrated ${users.length} users, ${sessions.length} sessions, ${messages.length} messages, and ${authSessions.length} auth sessions.`);
};

main()
  .catch((error) => {
    console.error("Migration failed:", error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeSqlite();
    await pool.end();
  });
