const { cpSync, copyFileSync, mkdirSync, rmSync } = require('node:fs');
const { join } = require('node:path');

const outDir = join(process.cwd(), 'dist');
const publicFiles = [
  'index.html',
  'result.html',
  'admin.html',
  'applicants_sample.csv',
  'applicants_sample.tsv'
];

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

for (const file of publicFiles) {
  copyFileSync(join(process.cwd(), file), join(outDir, file));
}

cpSync(join(process.cwd(), 'assets'), join(outDir, 'assets'), { recursive: true });
