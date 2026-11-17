import { test } from 'node:test';
import assert from 'node:assert/strict';
import { basename, dirname, join } from 'node:path';
import { checksFor, readCommit } from './commit-gate.mjs';
import { git, runHook, temporaryFolder, writeFile } from './test-support.mjs';

const BOTH_SHELLS = ['Bash', 'PowerShell'];
const POWERSHELL = ['PowerShell'];
const BASH = ['Bash'];

function repositoryWithBackend(t, verifyScript) {
  const repository = temporaryFolder(t);
  git(repository, 'init');
  writeFile(join(repository, 'backend', 'package.json'), JSON.stringify({ scripts: { verify: verifyScript } }));
  git(repository, 'add', 'backend/package.json');
  return repository;
}

function runGate(cwd, command = 'git commit -m "S9: probe"') {
  return runHook('commit-gate.mjs', { tool_name: 'PowerShell', tool_input: { command }, cwd });
}

function contextOf(result) {
  return JSON.parse(result.stdout).hookSpecificOutput.additionalContext;
}

function assertRead(commands, expected, shells = BOTH_SHELLS) {
  for (const shell of shells) {
    for (const command of commands) {
      assert.deepEqual(readCommit(command, shell), expected, `${shell}: ${JSON.stringify(command)}`);
    }
  }
}

function assertRefusedWith(commands, reason, shells = BOTH_SHELLS) {
  for (const shell of shells) {
    for (const command of commands) {
      assert.match(String(readCommit(command, shell)?.refusal), reason, `${shell}: ${JSON.stringify(command)}`);
    }
  }
}

test('passes a command that is not a commit', (t) => {
  assertRead(['git status', 'git log --grep commit', 'echo "git commit"'], null);
  const { status, stdout, stderr } = runHook('commit-gate.mjs', {
    tool_name: 'PowerShell',
    tool_input: { command: 'git status' },
    cwd: temporaryFolder(t),
  });
  assert.deepEqual({ status, stdout, stderr }, { status: 0, stdout: '', stderr: '' });
});

test('finds a commit behind -C and -c options', () => {
  assertRead(['git -C "../the lane" -c user.name=probe commit -m "S9: probe"'], { location: ['-C', '../the lane'] });
});

test('finds a commit written as Git, git.exe or after a global option', () => {
  const commands = ['Git commit -m x', 'git.exe commit -m x', 'git --no-pager commit -m x', 'git -c user.name="A B" commit -m x'];
  assertRead(commands, { location: [] });
  assertRead(['git --git-dir=".git" commit -m x'], { location: ['--git-dir=.git'] });
});

test('refuses a commit that is chained to another command', (t) => {
  const chained = [
    'git add a.txt; git commit -m x',
    'git add a.txt && git commit -m x',
    'git commit -m x || echo failed',
    'git commit -m x | Out-Null',
    'git add a.txt\ngit commit -m x',
  ];
  assertRefusedWith(chained, /command of its own/);
  const input = { tool_name: 'PowerShell', tool_input: { command: chained[0] }, cwd: temporaryFolder(t) };
  const result = runHook('commit-gate.mjs', input);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /command of its own/);
});

test('refuses commit -a', () => {
  assertRefusedWith(['git commit -a -m x', 'git commit -am x', 'git commit --all -m x'], /-a or --all/);
});

test('refuses -a inside a group of short options', () => {
  assertRefusedWith(['git commit -va -m x'], /-a or --all/);
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

test('lets a PowerShell here-string commit message with an apostrophe through', (t) => {
  const commands = [
    "git commit -m @'\nB4: the service's repository\n'@",
    "git commit -m @'\r\nB4: the service's repository\r\n'@",
  ];
  assertRead(commands, { location: [] }, POWERSHELL);
  const result = runGate(repositoryWithBackend(t, 'echo verified'), commands[0]);
  assert.equal(result.status, 0);
  assert.equal(contextOf(result), 'commit-gate passed: npm run verify in ./backend');
});

test('refuses a commit chained after a here-string or a carriage return', () => {
  const chained = ["echo @'\nx\n'@; git add backend/x.ts; git commit -m @'\nmsg\n'@", 'git add a.txt\rgit commit -m x'];
  assertRefusedWith(chained, /command of its own/, POWERSHELL);
  const afterAnEmptyHereString = [
    "echo @'\n'@; git add backend/x.ts; git commit -m @'\nmsg\n'@",
    "git commit -m @'\n'@; git push; echo @'\nx\n'@",
  ];
  assertRefusedWith(afterAnEmptyHereString, /could not read/, POWERSHELL);
});

test('refuses a commit in a command it cannot read', () => {
  const both = [
    'git commit -m "$(git add backend/x.ts)"',
    'Git commit -m "$(git add backend/x.ts)"',
    "echo x # it's\ngit add backend/x.ts; git commit -m 'y'",
  ];
  assertRefusedWith(both, /could not read/);
  const powershell = [
    'git commit -m @"\n$(git add backend/x.ts)\n"@',
    "echo `'; git add backend/x.ts; git commit -m x; `'",
    'git -C \u2018lane\u2019 commit -m x',
    'git -C $PWD/lane commit -m x',
    "write-output --x=@'\n'; git add backend/x.ts; git commit -m x\n'@'",
    'git `\ncommit -m x',
    'git commit -m "a`""; git commit -a -m y; echo `"',
    "git commit -m x@'\n'; git add backend/x.ts; echo '\n'@a",
  ];
  assertRefusedWith(powershell, /could not read/, POWERSHELL);
  const bash = [
    'git commit -m "`git add backend/x.ts`"',
    'git add backend/x.ts & git commit -m x',
    'git \\\ncommit -m x',
    'git commit -m "a\\""; git commit -a -m y; echo \\"',
  ];
  assertRefusedWith(bash, /could not read/, BASH);
});

test('passes a command it cannot read when it names no commit', () => {
  assertRead(['Get-ChildItem $HOME', 'echo $HOME'], null);
});

test('ends a word that begins with a quote at its closing quote in PowerShell', () => {
  assertRefusedWith(["git commit -m 'x'-a"], /-a or --all/, POWERSHELL);
  assertRead(["git -C '.'commit -m y"], { location: ['-C', '.'] }, POWERSHELL);
  assertRead(["git '--no-pager'commit -m y"], { location: [] }, POWERSHELL);
});

test("reads PowerShell's doubled quotes as one word", () => {
  assertRead(["git -C 'a''b' commit -m x"], { location: ['-C', "a'b"] }, POWERSHELL);
});

test('refuses a commit whose arguments PowerShell 5.1 would change on the way to git', () => {
  const commands = [
    "git '' commit -a -m x",
    `git commit -m 'a b" -a -m "c'`,
    'git -C "a""b" commit -m x',
    "git commit -m @'\nH1: a b\\\n'@ -a -m x",
  ];
  assertRefusedWith(commands, /could not read/, POWERSHELL);
});

test('splits -name:value as PowerShell hands it to git', () => {
  assertRefusedWith(['git commit -m:-a'], /-a or --all/, POWERSHELL);
});

test('reads 2>&1 as one redirection', () => {
  assertRefusedWith(['git 2>&1 commit -a -m x'], /-a or --all/);
});

test('finds a commit whose words are split by quotes', () => {
  assertRefusedWith(["git co'mmit' -a -m y"], /-a or --all/);
  assertRead(["git co'mmit' -m y"], { location: [] });
  assertRead(["git -C 'the'lane commit -m y"], { location: ['-C', 'thelane'] }, BASH);
});

test('finds a commit behind a global option that takes a value', () => {
  assertRead(['git --work-tree . commit -m x'], { location: ['--work-tree', '.'] });
  assertRead(['git --git-dir .git commit -m x'], { location: ['--git-dir', '.git'] });
  assertRead(['git --namespace x commit -m x', 'git --config-env user.name=NAME commit -m x'], { location: [] });
});

test('refuses a commit that git does not start', () => {
  assertRefusedWith(['X=1 git commit -m x', 'env git commit -m x'], /has to start the command/);
});

test('verifies the checkout that git commits in', (t) => {
  const repository = repositoryWithBackend(t, 'echo verified');
  const commands = [
    `git -C "${basename(repository)}" -C backend commit -m "S9: probe"`,
    `git --git-dir="${repository}/.git" --work-tree="${repository}" commit -m "S9: probe"`,
  ];
  for (const command of commands) {
    const result = runGate(dirname(repository), command);
    assert.equal(result.status, 0, `${command}\n${result.stderr}`);
    assert.equal(contextOf(result), 'commit-gate passed: npm run verify in ./backend');
  }
});

test('refuses a commit whose checkout cannot be found', (t) => {
  const result = runGate(repositoryWithBackend(t, 'exit 1'), 'git -C "no-such-folder" commit -m "S9: probe"');
  assert.equal(result.status, 2);
  assert.match(result.stderr, /the checkout of this commit could not be found/);
});

test('reads a Windows path as a plain word', () => {
  assertRead(['git -C C:\\repo-notes commit -m "H1: notes"'], { location: ['-C', 'C:\\repo-notes'] }, POWERSHELL);
  assertRead(['git -C C:/repo-notes commit -m "H1: notes"'], { location: ['-C', 'C:/repo-notes'] });
});
