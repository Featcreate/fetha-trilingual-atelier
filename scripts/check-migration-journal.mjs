import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const migrationsDir = join(process.cwd(), "drizzle/migrations");
const journalPath = join(migrationsDir, "meta/_journal.json");

const journal = JSON.parse(await readFile(journalPath, "utf8"));
const sqlFiles = (await readdir(migrationsDir))
  .filter((name) => name.endsWith(".sql"))
  .sort();
const entries = journal.entries;

const errors = [];
const tags = new Set();
const indexes = new Set();
let previousWhen = -Infinity;

for (let i = 0; i < entries.length; i += 1) {
  const entry = entries[i];

  if (entry.idx !== i) {
    errors.push(`journal index ${entry.idx} is not contiguous at position ${i}`);
  }
  if (indexes.has(entry.idx)) {
    errors.push(`duplicate journal index ${entry.idx}`);
  }
  indexes.add(entry.idx);

  if (tags.has(entry.tag)) {
    errors.push(`duplicate migration tag ${entry.tag}`);
  }
  tags.add(entry.tag);

  if (!Number.isFinite(entry.when) || entry.when < previousWhen) {
    errors.push(`migration timestamp is not non-decreasing at ${entry.tag}`);
  }
  previousWhen = entry.when;

  if (!sqlFiles.includes(`${entry.tag}.sql`)) {
    errors.push(`journal entry has no SQL file: ${entry.tag}.sql`);
  }
}

for (const file of sqlFiles) {
  const tag = file.slice(0, -4);
  if (!tags.has(tag)) {
    errors.push(`SQL migration is missing from _journal.json: ${file}`);
  }
}

if (errors.length > 0) {
  for (const error of errors) process.stderr.write(`ERROR: ${error}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `Migration journal OK: ${entries.length} entries match ${sqlFiles.length} SQL files.\n`,
  );
}
