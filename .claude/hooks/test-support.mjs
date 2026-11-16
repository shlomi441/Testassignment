import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

export function runHook(script, input) {
  return spawnSync(process.execPath, [join(import.meta.dirname, script)], {
    input: JSON.stringify(input),
    encoding: 'utf8',
  });
}

export function temporaryFolder(t) {
  const folder = mkdtempSync(join(tmpdir(), 'hook-test-'));
  t.after(() => rmSync(folder, { recursive: true, force: true }));
  return folder;
}

export function writeFile(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

export function git(cwd, ...args) {
  return spawnSync('git', args, { cwd, encoding: 'utf8' });
}
