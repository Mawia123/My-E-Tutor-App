const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const dbPath = path.join(__dirname, "..", "database.db");
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

const closeDb = () =>
  new Promise((resolve, reject) => {
    db.close((err) => {
      if (err) reject(err);
      else resolve();
    });
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
      tutorId,
    ]
  );
};

const parseArgs = (argv) => {
  const parsed = {};

  for (let index = 0; index < argv.length; index += 1) {
    const part = argv[index];

    if (!part.startsWith("--")) {
      continue;
    }

    const key = part.slice(2);
    const next = argv[index + 1];

    if (!next || next.startsWith("--")) {
      parsed[key] = true;
      continue;
    }

    parsed[key] = next;
    index += 1;
  }

  return parsed;
};

const printUsage = () => {
  console.log("Delete a user and all related sessions/messages.");
  console.log("");
  console.log("Usage:");
  console.log("  npm run delete:user -- --email user@example.com");
  console.log("  npm run delete:user -- --id 12");
  console.log("");
  console.log("To actually delete, pass --confirm with the user's email or id:");
  console.log("  npm run delete:user -- --email user@example.com --confirm user@example.com");
  console.log("  npm run delete:user -- --id 12 --confirm 12");
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || (!args.id && !args.email) || (args.id && args.email)) {
    printUsage();
    process.exitCode = args.help ? 0 : 1;
    return;
  }

  const lookupField = args.id ? "id" : "email";
  const lookupValue = args.id ? String(args.id) : String(args.email);
  const user = await get(`SELECT * FROM users WHERE ${lookupField} = ?`, [lookupValue]);

  if (!user) {
    console.error(`User not found for ${lookupField}=${lookupValue}`);
    process.exitCode = 1;
    return;
  }

  const relatedSessions = await all(
    "SELECT * FROM sessions WHERE studentId = ? OR tutorId = ?",
    [String(user.id), String(user.id)]
  );
  const relatedMessages = await all(
    "SELECT * FROM messages WHERE senderId = ? OR receiverId = ?",
    [String(user.id), String(user.id)]
  );
  const affectedTutorIds = [...new Set(
    relatedSessions
      .map((session) => String(session.tutorId))
      .filter((tutorId) => tutorId !== String(user.id))
  )];

  console.log(`User: ${user.fullName || user.name || "(no name)"} <${user.email}>`);
  console.log(`Role: ${user.role}`);
  console.log(`ID: ${user.id}`);
  console.log(`Sessions to delete: ${relatedSessions.length}`);
  console.log(`Messages to delete: ${relatedMessages.length}`);

  if (args.confirm !== String(user.id) && args.confirm !== String(user.email)) {
    console.log("");
    console.log("Dry run only. Nothing was deleted.");
    console.log(`Re-run with --confirm ${user.email} or --confirm ${user.id} to proceed.`);
    process.exitCode = 1;
    return;
  }

  await run("BEGIN TRANSACTION");

  try {
    await run("DELETE FROM messages WHERE senderId = ? OR receiverId = ?", [String(user.id), String(user.id)]);
    await run("DELETE FROM sessions WHERE studentId = ? OR tutorId = ?", [String(user.id), String(user.id)]);
    await run("DELETE FROM users WHERE id = ?", [String(user.id)]);
    await run("COMMIT");
  } catch (error) {
    await run("ROLLBACK");
    throw error;
  }

  await Promise.all(affectedTutorIds.map((tutorId) => refreshTutorStats(tutorId)));

  console.log("");
  console.log("User deleted successfully.");
};

main()
  .catch((error) => {
    console.error("Delete failed:", error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb();
  });
