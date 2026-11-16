import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { git, runHook, temporaryFolder, writeFile } from './test-support.mjs';

// A repository with one commit, so that a worktree can be added, and its notes folder beside it.
function repositoryWithNotes(t, notes) {
  const parent = temporaryFolder(t);
  const repository = join(parent, 'repo');
  mkdirSync(repository);
  git(repository, 'init');
  git(repository, '-c', 'user.name=probe', '-c', 'user.email=probe@example.com', 'commit', '--allow-empty', '-m', 'probe');
  for (const [name, content] of Object.entries(notes)) {
    writeFile(join(parent, 'repo-notes', name), content);
  }
  return repository;
}

function runSessionStart(cwd) {
  return runHook('session-start.mjs', { cwd });
}

const SILENT = { status: 0, stdout: '', stderr: '' };

test("prints the board and the lead's state in the main checkout", (t) => {
  const repository = repositoryWithNotes(t, { 'board.md': 'the board\n', 'state/lead.md': 'the lead state\n' });
  const { stdout } = runSessionStart(repository);
  assert.match(stdout, /board\.md ---\nthe board\n[\s\S]*state[\\/]lead\.md ---\nthe lead state\n/);
});

test("prints the lane's state in a worktree", (t) => {
  const repository = repositoryWithNotes(t, {
    'board.md': 'the board\n',
    'state/lead.md': 'the lead state\n',
    'state/backend.md': 'the backend state\n',
  });
  const worktree = join(repository, '.claude', 'worktrees', 'backend');
  git(repository, 'worktree', 'add', '-b', 'worktree-backend', worktree);
  const { stdout } = runSessionStart(worktree);
  assert.match(stdout, /board\.md ---\nthe board\n[\s\S]*state[\\/]backend\.md ---\nthe backend state\n/);
  assert.doesNotMatch(stdout, /the lead state/);
});

test('prints the board alone when the seat has no state file', (t) => {
  const repository = repositoryWithNotes(t, { 'board.md': 'the board\n' });
  const { status, stdout, stderr } = runSessionStart(repository);
  assert.deepEqual({ status, stderr }, { status: 0, stderr: '' });
  assert.match(stdout, /^--- [^\n]*board\.md ---\nthe board\n+$/);
});

test('prints nothing without a notes folder', (t) => {
  const repository = repositoryWithNotes(t, {});
  const { status, stdout, stderr } = runSessionStart(repository);
  assert.deepEqual({ status, stdout, stderr }, SILENT);
});

test('prints nothing outside a git repository', (t) => {
  const { status, stdout, stderr } = runSessionStart(temporaryFolder(t));
  assert.deepEqual({ status, stdout, stderr }, SILENT);
});
