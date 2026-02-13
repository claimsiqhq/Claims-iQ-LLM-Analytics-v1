import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let supabaseUrl = (process.env.SUPABASE_URL || "").trim();
const mdMatch = supabaseUrl.match(/\[([^\]]+)\]/);
if (mdMatch) supabaseUrl = mdMatch[1];
supabaseUrl = supabaseUrl.replace(/\/+$/, "");
const supabaseServiceKey = (process.env.SUPABASE_SERVICE_KEY || "").trim();

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
});

const MIGRATIONS_DIR = path.join(__dirname, "migrations");
const MIGRATION_TABLE = "schema_migrations";

async function execSQL(sql: string): Promise<any> {
  const { data, error } = await supabase.rpc("execute_raw_sql", { query_text: sql });
  if (error) throw new Error(error.message);
  return data;
}

async function ensureMigrationTable() {
  const result = await execSQL(
    `SELECT to_regclass('public.${MIGRATION_TABLE}') AS tbl`
  );
  const exists = result && result.length > 0 && result[0].tbl;
  if (!exists) {
    const createSQL = `CREATE TABLE IF NOT EXISTS ${MIGRATION_TABLE} (id SERIAL PRIMARY KEY, name TEXT UNIQUE NOT NULL, applied_at TIMESTAMPTZ DEFAULT now())`;
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/execute_raw_sql`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: supabaseServiceKey,
        Authorization: `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({ query_text: createSQL }),
    });
    if (!res.ok) {
      const body = await res.text();
      if (!body.includes("already exists")) {
        throw new Error(`Failed to create migration table: ${body}`);
      }
    }
    console.log("  Created schema_migrations table");
  }
}

async function getAppliedMigrations(): Promise<string[]> {
  const { data } = await supabase
    .from(MIGRATION_TABLE)
    .select("name")
    .order("id", { ascending: true });
  return (data || []).map((r: any) => r.name);
}

function getMigrationFiles(direction: "up" | "down"): string[] {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(`.${direction}.sql`))
    .sort();
}

async function runMigrationFile(filePath: string): Promise<void> {
  const sql = fs.readFileSync(filePath, "utf-8");
  const statements: string[] = [];
  let current = "";

  for (const line of sql.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("--") || trimmed === "") continue;
    current += line + "\n";
    if (trimmed.endsWith(";")) {
      statements.push(current.trim().replace(/;\s*$/, ""));
      current = "";
    }
  }
  if (current.trim()) statements.push(current.trim().replace(/;\s*$/, ""));

  for (const stmt of statements) {
    if (!stmt) continue;
    await execSQL(stmt);
  }
}

async function migrateUp() {
  await ensureMigrationTable();
  const applied = await getAppliedMigrations();
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
    await runMigrationFile(path.join(MIGRATIONS_DIR, file));
    await supabase.from(MIGRATION_TABLE).insert({ name });
    console.log(`  ✓ ${name} applied`);
    ranCount++;
  }

  if (ranCount === 0) {
    console.log("All migrations already applied.");
  } else {
    console.log(`\n${ranCount} migration(s) applied.`);
  }
}

async function migrateDown() {
  await ensureMigrationTable();
  const applied = await getAppliedMigrations();

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
  await runMigrationFile(downPath);
  await supabase.from(MIGRATION_TABLE).delete().eq("name", lastApplied);
  console.log(`  ✓ ${lastApplied} reverted`);
}

async function migrateList() {
  await ensureMigrationTable();
  const applied = await getAppliedMigrations();
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

(async () => {
  try {
    switch (command) {
      case "up":
        console.log("Running migrations up...\n");
        await migrateUp();
        break;
      case "down":
        console.log("Running migration down...\n");
        await migrateDown();
        break;
      case "list":
        await migrateList();
        break;
      default:
        console.log("Usage: tsx supabase/migrate.ts [up|down|list]");
    }
  } catch (err: any) {
    console.error("Migration failed:", err.message);
    process.exit(1);
  }
})();
