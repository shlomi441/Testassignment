import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

const { cwd } = JSON.parse(readFileSync(0, 'utf8'));
const git = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir', '--show-toplevel'], {
  cwd,
  encoding: 'utf8',
});
const [commonDir, top] = git.stdout.trim().split('\n');
const mainCheckout = dirname(commonDir);
const notes = `${mainCheckout}-notes`;
const board = join(notes, 'board.md');
const show = (file) => console.log(`--- ${file} ---\n${readFileSync(file, 'utf8')}`);

if (git.status === 0 && existsSync(board)) {
  show(board);
  const seat = top === mainCheckout ? 'lead' : basename(top);
  const state = join(notes, 'state', `${seat}.md`);
  if (existsSync(state)) show(state);
}
