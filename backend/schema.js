const { query } = require("./db");

const ensureSchema = async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      full_name TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL,
      password TEXT NOT NULL DEFAULT '',
      password_hash TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL,
      approved BOOLEAN NOT NULL DEFAULT FALSE,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      bio TEXT NOT NULL DEFAULT '',
      academic_history TEXT NOT NULL DEFAULT '',
      subjects JSONB NOT NULL DEFAULT '[]'::jsonb,
      avatar TEXT NOT NULL DEFAULT '',
      rating DOUBLE PRECISION NOT NULL DEFAULT 0,
      total_sessions INTEGER NOT NULL DEFAULT 0,
      minimum_notice_hours INTEGER NOT NULL DEFAULT 6,
      accepts_short_notice_requests BOOLEAN NOT NULL DEFAULT TRUE
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      student_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      tutor_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      subject TEXT NOT NULL,
      unit TEXT NOT NULL DEFAULT '',
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      duration INTEGER NOT NULL DEFAULT 60,
      status TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      feedback TEXT NOT NULL DEFAULT '',
      rating DOUBLE PRECISION NOT NULL DEFAULT 0,
      review_is_anonymous BOOLEAN NOT NULL DEFAULT FALSE,
      created_at BIGINT NOT NULL,
      cancellation_reason TEXT NOT NULL DEFAULT '',
      reschedule_options JSONB NOT NULL DEFAULT '[]'::jsonb
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      sender_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      receiver_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      text TEXT NOT NULL,
      timestamp BIGINT NOT NULL,
      read BOOLEAN NOT NULL DEFAULT FALSE
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS sessions_auth (
      id TEXT PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      created_at BIGINT NOT NULL,
      expires_at BIGINT NOT NULL
    )
  `);

  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique_normalized
    ON users (LOWER(TRIM(email)))
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_sessions_tutor_date
    ON sessions (tutor_id, date)
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_messages_participants
    ON messages (sender_id, receiver_id, timestamp)
  `);

  await query(`
    UPDATE users
    SET approved = TRUE
    WHERE role = 'TUTOR' AND approved = FALSE
  `);

  await query(`
    DELETE FROM sessions_auth
    WHERE expires_at <= $1
  `, [Date.now()]);
};

module.exports = {
  ensureSchema,
};
