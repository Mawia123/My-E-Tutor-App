const { Pool } = require("pg");

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required.");
}

const shouldUseSsl = !/localhost|127\.0\.0\.1/.test(databaseUrl);

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: shouldUseSsl ? { rejectUnauthorized: false } : false,
});

pool.on("error", (error) => {
  console.error("Unexpected PostgreSQL error:", error);
});

const query = (text, params = []) => pool.query(text, params);

const get = async (text, params = []) => {
  const result = await query(text, params);
  return result.rows[0] || null;
};

const all = async (text, params = []) => {
  const result = await query(text, params);
  return result.rows;
};

module.exports = {
  pool,
  query,
  get,
  all,
};
