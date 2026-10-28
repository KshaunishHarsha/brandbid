import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const migrationsDir = fileURLToPath(new URL('./migrations/', import.meta.url));
const files = (await readdir(migrationsDir)).filter((file) => file.endsWith('.sql')).sort();
const failures = [];

for (const file of files) {
  const source = await readFile(path.join(migrationsDir, file), 'utf8');

  // A migration that sets its search_path to include extensions may use bare citext.
  if (/^set search_path *= *.*extensions/m.test(source)) continue;

  const lines = source.split(/\r?\n/);
  const hits = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/\bcitext\b/.test(line) && !/extensions\.citext|create extension/.test(line)) {
      hits.push(`    ${index + 1}:${line}`);
    }
  }

  if (hits.length > 0) failures.push(`FAIL ${file} uses citext without the 'extensions.' prefix:\n${hits.join('\n')}`);
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  console.error("Write extensions.citext. See packages/db/check-migrations.mjs");
  process.exitCode = 1;
} else {
  console.log('ok: migrations qualify extension types');
}
