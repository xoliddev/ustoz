// Embeds migrations/*.sql into src/migrations/*.ts so the same SQL runs in Node and in the browser worker.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
for (const f of readdirSync(join(root, 'migrations')).filter((x) => x.endsWith('.sql'))) {
  const sql = readFileSync(join(root, 'migrations', f), 'utf8');
  if (sql.includes('`') || sql.includes('${')) throw new Error(`${f}: backticks are not allowed`);
  writeFileSync(join(root, 'src/migrations', f.replace('.sql', '.ts')), `// GENERATED from migrations/${f} by \`npm run gen:migrations -w @ustoz/db\` — do not edit by hand.\nexport default String.raw\`${sql}\`;\n`);
}
