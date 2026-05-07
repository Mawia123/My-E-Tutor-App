const { query, get, all, pool } = require("../db");
const { ensureSchema } = require("../schema");

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
  await ensureSchema();

  const args = parseArgs(process.argv.slice(2));

  if (args.help || (!args.id && !args.email) || (args.id && args.email)) {
    printUsage();
    process.exitCode = args.help ? 0 : 1;
    return;
  }

  const lookupField = args.id ? "id" : "LOWER(TRIM(email))";
  const lookupValue = args.id ? String(args.id) : String(args.email).trim().toLowerCase();
  const user = await get(`SELECT * FROM users WHERE ${lookupField} = $1`, [lookupValue]);

  if (!user) {
    console.error(`User not found for ${args.id ? "id" : "email"}=${lookupValue}`);
    process.exitCode = 1;
    return;
  }

  const relatedSessions = await all(
    "SELECT * FROM sessions WHERE student_id = $1 OR tutor_id = $1",
    [String(user.id)]
  );
  const relatedMessages = await all(
    "SELECT * FROM messages WHERE sender_id = $1 OR receiver_id = $1",
    [String(user.id)]
  );
  const affectedTutorIds = [...new Set(
    relatedSessions
      .map((session) => String(session.tutor_id))
      .filter((tutorId) => tutorId !== String(user.id))
  )];

  console.log(`User: ${user.full_name || user.name || "(no name)"} <${user.email}>`);
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

  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM users WHERE id = $1", [String(user.id)]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
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
    await pool.end();
  });
