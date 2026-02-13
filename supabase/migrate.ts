import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATABASE_URL =
  process.env.SUPABASE_DB_URL ||
  "postgresql://postgres.lfrhuxzxlzlztghgnqzg:zyBMeDbkUKV2CkWB@aws-1-eu-north-1.pooler.supabase.com:5432/postgres";

const MIGRATIONS_DIR = path.join(__dirname, "migrations");

function runQuery(sql: string): string {
  try {
    return execSync(`psql "${DATABASE_URL}" -t -A -c ${JSON.stringify(sql)}`, {
      encoding: "utf-8",
      timeout: 30000,
    }).trim();
  } catch (e: any) {
    throw new Error(e.stderr || e.message);
  }
}

function runFile(filePath: string): void {
  execSync(`psql "${DATABASE_URL}" -f ${JSON.stringify(filePath)}`, {
    encoding: "utf-8",
    timeout: 30000,
    stdio: ["pipe", "pipe", "pipe"],
  });
}

function ensureMigrationTable() {
  runQuery("CREATE TABLE IF NOT EXISTS schema_migrations (id SERIAL PRIMARY KEY, name TEXT UNIQUE NOT NULL, applied_at TIMESTAMPTZ DEFAULT now())");
}

function getAppliedMigrations(): string[] {
  const result = runQuery(
    `SELECT name FROM schema_migrations ORDER BY id ASC`
  );
  if (!result) return [];
  return result.split("\n").filter(Boolean);
}

function getMigrationFiles(direction: "up" | "down"): string[] {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(`.${direction}.sql`))
    .sort();
}

function migrateUp() {
  ensureMigrationTable();
  const applied = getAppliedMigrations();
  const files = getMigrationFiles("up");

  if (files.length === 0) {
    console.log("No migration files found in supabase/migrations/");
    return;
  }

  let ranCount = 0;
  for (const file of files) {
    const name = file.replace(".up.sql", "");
    if (applied.includes(name)) {
      console.log(`  ✓ ${name} (already applied)`);
      continue;
    }
    console.log(`  ▸ Applying ${name}...`);
    runFile(path.join(MIGRATIONS_DIR, file));
    runQuery(
      `INSERT INTO schema_migrations (name) VALUES ('${name}') ON CONFLICT DO NOTHING`
    );
    console.log(`  ✓ ${name} applied`);
    ranCount++;
  }

  if (ranCount === 0) {
    console.log("All migrations already applied.");
  } else {
    console.log(`\n${ranCount} migration(s) applied.`);
  }
}

function migrateDown() {
  ensureMigrationTable();
  const applied = getAppliedMigrations();

  if (applied.length === 0) {
    console.log("No migrations to revert.");
    return;
  }

  const lastApplied = applied[applied.length - 1];
  const downFile = `${lastApplied}.down.sql`;
  const downPath = path.join(MIGRATIONS_DIR, downFile);

  if (!fs.existsSync(downPath)) {
    console.error(`No down migration found: ${downFile}`);
    process.exit(1);
  }

  console.log(`  ▸ Reverting ${lastApplied}...`);
  runFile(downPath);
  runQuery(`DELETE FROM schema_migrations WHERE name = '${lastApplied}'`);
  console.log(`  ✓ ${lastApplied} reverted`);
}

function migrateList() {
  ensureMigrationTable();
  const applied = getAppliedMigrations();
  const files = getMigrationFiles("up");

  console.log("\nMigrations:");
  console.log("─".repeat(60));

  if (files.length === 0) {
    console.log("  No migration files found in supabase/migrations/");
    return;
  }

  for (const file of files) {
    const name = file.replace(".up.sql", "");
    const status = applied.includes(name) ? "✓ applied" : "○ pending";
    console.log(`  ${status}  ${name}`);
  }
  console.log("");
}

const command = process.argv[2] || "list";

switch (command) {
  case "up":
    console.log("Running migrations up...\n");
    migrateUp();
    break;
  case "down":
    console.log("Running migration down...\n");
    migrateDown();
    break;
  case "list":
    migrateList();
    break;
  default:
    console.log("Usage: tsx supabase/migrate.ts [up|down|list]");
}
