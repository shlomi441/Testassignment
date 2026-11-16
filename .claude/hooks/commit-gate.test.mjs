import { test } from 'node:test';
import assert from 'node:assert/strict';
import { basename, dirname, join } from 'node:path';
import { checksFor, readCommit } from './commit-gate.mjs';
import { git, runHook, temporaryFolder, writeFile } from './test-support.mjs';

function repositoryWithBackend(t, verifyScript) {
  const repository = temporaryFolder(t);
  git(repository, 'init');
  writeFile(join(repository, 'backend', 'package.json'), JSON.stringify({ scripts: { verify: verifyScript } }));
  git(repository, 'add', 'backend/package.json');
  return repository;
}

function runGate(cwd, command = 'git commit -m "S9: probe"') {
  return runHook('commit-gate.mjs', { tool_input: { command }, cwd });
}

function contextOf(result) {
  return JSON.parse(result.stdout).hookSpecificOutput.additionalContext;
}

test('passes a command that is not a commit', (t) => {
  for (const command of ['git status', 'git log --grep commit', 'echo "git commit"']) {
    assert.equal(readCommit(command), null);
  }
  const { status, stdout, stderr } = runHook('commit-gate.mjs', {
    tool_input: { command: 'git status' },
    cwd: temporaryFolder(t),
  });
  assert.deepEqual({ status, stdout, stderr }, { status: 0, stdout: '', stderr: '' });
});

test('finds a commit behind -C and -c options', () => {
  assert.deepEqual(readCommit('git -C "../the lane" -c user.name=probe commit -m "S9: probe"'), {
    directory: '../the lane',
  });
});

test('finds a commit written as Git, git.exe or after a global option', () => {
  const commands = [
    'Git commit -m x',
    'git.exe commit -m x',
    'git --no-pager commit -m x',
    'git --git-dir=".git" commit -m x',
    'git -c user.name="A B" commit -m x',
  ];
  for (const command of commands) {
    assert.deepEqual(readCommit(command), { directory: undefined });
  }
});

test('reads a PowerShell here-string message as one value, whatever quotes it holds', () => {
  const commands = [
    "git commit -m @'\nB4: readonly on the service's repository\n\nCo-Authored-By: probe\n'@",
    'git commit -m @"\nO1: a 12" screen\nsecond line\n"@',
    "git commit -m @'\r\nB4: the service's repository\r\n'@",
    "git commit -m @' \t\nB4: the service's repository\n'@",
    'git commit -m @" \t\r\nO1: a 12" screen\r\n"@',
  ];
  for (const command of commands) {
    assert.deepEqual(readCommit(command, 'PowerShell'), { directory: undefined });
  }
});

test('reads @ quotes as plain text in Bash, so a commit between them is still found', () => {
  assert.deepEqual(readCommit("echo @'\n'; git commit -m x; echo '\n'@", 'Bash'), {
    refusal: 'a git commit has to be a command of its own: finish staging, then commit',
  });
});

test('lets a PowerShell commit with a here-string message through the hook', (t) => {
  const repository = temporaryFolder(t);
  git(repository, 'init');
  writeFile(join(repository, 'README.md'), 'readme\n');
  git(repository, 'add', 'README.md');
  const command = "git commit -m @'\nS9: the author's probe\n'@";
  const result = runHook('commit-gate.mjs', { tool_name: 'PowerShell', tool_input: { command }, cwd: repository });
  assert.equal(result.status, 0);
  assert.equal(contextOf(result), 'commit-gate passed: nothing to verify');
});

test('refuses a commit that is chained to another command', (t) => {
  const chained = [
    'git add a.txt; git commit -m x',
    'git add a.txt && git commit -m x',
    'git commit -m x || echo failed',
    'git commit -m x | Out-Null',
    'git add a.txt\ngit commit -m x',
  ];
  for (const command of chained) {
    assert.match(readCommit(command).refusal, /command of its own/);
  }
  const result = runHook('commit-gate.mjs', { tool_input: { command: chained[0] }, cwd: temporaryFolder(t) });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /command of its own/);
});

test('refuses commit -a', () => {
  for (const command of ['git commit -a -m x', 'git commit -am x', 'git commit --all -m x']) {
    assert.match(readCommit(command).refusal, /-a or --all/);
  }
});

test('maps staged files to the packages to verify', (t) => {
  const top = temporaryFolder(t);
  writeFile(join(top, 'backend', 'package.json'), '{}');
  const staged = ['backend/src/main.ts', 'frontend/src/App.tsx', '.claude/hooks/guard.mjs'];
  assert.deepEqual(checksFor(staged, top), [
    { folder: 'backend', script: 'verify' },
    { folder: '', script: 'test:hooks' },
  ]);
});

test('ignores a staged file outside both packages and the hooks', (t) => {
  const top = temporaryFolder(t);
  writeFile(join(top, 'backend', 'package.json'), '{}');
  const staged = ['README.md', 'backend-notes.md', '.claude/settings.json', 'infra/main.tf'];
  assert.deepEqual(checksFor(staged, top), []);
});

test('refuses the commit when verify fails', (t) => {
  const verify = `node -e "for (let line = 1; line !== 101; line++) console.log('output line ' + line); process.exit(1)"`;
  const result = runGate(repositoryWithBackend(t, verify));
  assert.equal(result.status, 2);
  assert.match(result.stderr, /npm run verify in \.\/backend failed/);
  assert.match(result.stderr, /output line 100\n/);
  assert.doesNotMatch(result.stderr, /output line 1\n/);
});

test('lets the commit pass and names what it verified', (t) => {
  const result = runGate(repositoryWithBackend(t, 'echo verified'));
  const expected = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      additionalContext: 'commit-gate passed: npm run verify in ./backend',
    },
  };
  assert.equal(result.status, 0);
  assert.equal(result.stdout, `${JSON.stringify(expected)}\n`);
});

test('verifies the checkout that -C names', (t) => {
  const repository = repositoryWithBackend(t, 'echo verified');
  const result = runGate(dirname(repository), `git -C "${basename(repository)}" commit -m "S9: probe"`);
  assert.equal(contextOf(result), 'commit-gate passed: npm run verify in ./backend');
});

test('lets a commit with nothing to verify pass and says so', (t) => {
  const repository = temporaryFolder(t);
  git(repository, 'init');
  writeFile(join(repository, 'README.md'), 'readme\n');
  git(repository, 'add', 'README.md');
  const result = runGate(repository);
  assert.equal(result.status, 0);
  assert.equal(contextOf(result), 'commit-gate passed: nothing to verify');
});
