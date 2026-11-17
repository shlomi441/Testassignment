import { test } from 'node:test';
import assert from 'node:assert/strict';
import { refusal } from './guard.mjs';
import { runHook } from './test-support.mjs';

const MAIN_CHECKOUT = 'C:\\repo';
const WORKTREE = 'C:\\repo\\.claude\\worktrees\\backend';
const BOTH_SHELLS = ['Bash', 'PowerShell'];
const POWERSHELL = ['PowerShell'];
const BASH = ['Bash'];

function assertRefused(command, rule, cwd = MAIN_CHECKOUT, shells = BOTH_SHELLS) {
  for (const shell of shells) {
    const reason = String(refusal(command, cwd, shell));
    assert.match(reason, new RegExp(`^guard rule ${rule}: `), `${shell}: ${JSON.stringify(command)}`);
  }
}

function assertAllowed(command, cwd = MAIN_CHECKOUT, shells = BOTH_SHELLS) {
  for (const shell of shells) {
    assert.equal(refusal(command, cwd, shell), null, `${shell}: ${JSON.stringify(command)}`);
  }
}

test('refuses terraform apply', () => {
  assertRefused('terraform apply -auto-approve', 1);
});

test('refuses terraform destroy with -chdir', () => {
  assertRefused('terraform -chdir=infra destroy', 1);
});

test('refuses terraform.exe apply after a call operator', () => {
  assertRefused('& Terraform.exe apply', 1);
});

test('refuses terraform validate inside a worktree', () => {
  assertRefused('terraform validate', 2, WORKTREE);
  assertRefused('terraform validate', 2, 'C:/repo/.claude/worktrees/backend');
});

test('allows terraform fmt inside a worktree', () => {
  assertAllowed('terraform fmt -check', WORKTREE);
});

test('allows terraform plan in the main checkout', () => {
  assertAllowed('terraform plan');
});

test('refuses an aws command', () => {
  assertRefused('aws sts get-caller-identity', 3);
});

test('refuses aws after a separator', () => {
  for (const command of ['cd infra; aws s3 ls', 'cd infra && aws s3 ls', 'echo x | aws s3 cp - s3://b/k', '(aws s3 ls)']) {
    assertRefused(command, 3);
  }
});

test('allows a word that only contains aws', () => {
  assertAllowed('git grep hashicorp/aws');
  assertAllowed('git grep aws_instance');
});

test("allows aws as another command's argument", () => {
  assertAllowed('where.exe aws');
});

test('refuses a read of the ssh folder with either slash', () => {
  assertRefused('cat ~/.ssh/config', 4);
  assertRefused('Get-Content $HOME\\.ssh\\config', 4);
  assertRefused('cat .ssh/config', 4);
});

test('refuses a quoted key path', () => {
  assertRefused('Get-Content "D:\\Keys\\Deploy.PEM"', 4);
  assertRefused("cat 'D:/keys/id_ed25519'", 4);
  assertRefused('type "D:\\keys\\id_rsa"', 4);
});

test('refuses a state file', () => {
  assertRefused('cat infra/terraform.tfstate', 4);
  assertRefused('cat infra/terraform.tfstate.backup', 4);
});

test('refuses the aws folder, an env file and a variables file', () => {
  assertRefused('cat ~/.aws/config', 4);
  assertRefused('cd ~; Get-Content .aws\\credentials', 4);
  assertRefused('cat .env', 4);
  assertRefused('Get-Content backend\\.env.local', 4);
  assertRefused('cat infra/prod.tfvars', 4);
});

test('allows process.env in a node command', () => {
  assertAllowed('node -e "console.log(process.env.PATH)"');
});

test('refuses a forced push', () => {
  for (const flag of ['--force', '-f', '--force-with-lease', '-fu']) {
    assertRefused(`git push ${flag} origin main`, 5);
  }
});

test('refuses a forced push after -C and -c options', () => {
  assertRefused('git -C ../repo -c push.default=current push --force', 5);
});

test('allows a plain push', () => {
  assertAllowed('git push -u origin main');
});

test('reads a push or a commit only up to the next separator', () => {
  assertAllowed('git push -u origin main 2>&1 | Select-Object -First 5');
  assertAllowed('git commit -m "S9: probe" | Out-File -NoNewline commit.log');
});

test('refuses a commit that skips checks', () => {
  assertRefused('git commit --no-verify -m "S9: probe"', 6);
  assertRefused('git commit -n -m "S9: probe"', 6);
  assertRefused('git commit -nm "S9: probe"', 6);
});

test('allows a commit whose message mentions the flag', () => {
  assertAllowed('git commit -m "S9: never use --no-verify"');
});

test('allows an ordinary command', () => {
  assertAllowed('npm run verify');
  assertAllowed('npm run verify', WORKTREE);
  const input = { tool_name: 'PowerShell', tool_input: { command: 'npm run verify' }, cwd: MAIN_CHECKOUT };
  const { status, stderr } = runHook('guard.mjs', input);
  assert.deepEqual({ status, stderr }, { status: 0, stderr: '' });
});

test('exits 2 with the reason on standard error', () => {
  const input = { tool_name: 'PowerShell', tool_input: { command: 'terraform apply' }, cwd: MAIN_CHECKOUT };
  const result = runHook('guard.mjs', input);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /^guard rule 1: /);
});

test("allows a here-string commit message that holds an apostrophe and a rule's words", () => {
  const message = "H1: it's the author who runs terraform apply";
  const commands = [
    `git commit -m @'\n${message}\n'@`,
    `git commit -m @'\r\n${message}\r\n'@`,
    `git commit -m @' \t\n${message}\n'@`,
  ];
  for (const command of commands) {
    assertAllowed(command, MAIN_CHECKOUT, POWERSHELL);
  }
  const input = { tool_name: 'PowerShell', tool_input: { command: commands[0] }, cwd: MAIN_CHECKOUT };
  const { status, stderr } = runHook('guard.mjs', input);
  assert.deepEqual({ status, stderr }, { status: 0, stderr: '' });
});

test('refuses a command after an empty here-string or a footer after a carriage return', () => {
  const hereStrings = [
    "@'\n'@; terraform apply; write-output @'\nx\n'@",
    '@"\n"@; terraform apply; write-output @"\nx\n"@',
    "@'\r\n'@; terraform apply; write-output @'\r\nx\r\n'@",
    "@'\nx\r'@; terraform apply; write-output @'\n'@",
    '@"\nx\r"@; terraform apply; write-output @"\n"@',
  ];
  for (const hereString of hereStrings) {
    assertRefused(`write-output ${hereString}`, 1, MAIN_CHECKOUT, POWERSHELL);
    assertRefused(`git commit -m ${hereString}`, 1, MAIN_CHECKOUT, POWERSHELL);
  }
});

test('refuses a command behind a here-string opened after an operator or a bracket', () => {
  const commands = [
    "$m=@'\nit's\n'@; terraform apply; echo 'x'",
    "write-output (@'\nit's\n'@); terraform apply; echo 'x'",
    "write-output 1,@'\nit's\n'@; terraform apply; echo 'x'",
    "write-output 1;@'\nit's\n'@ | out-null; terraform apply; echo 'x'",
    "& {@'\nit's\n'@}; terraform apply; echo 'x'",
  ];
  for (const command of commands) {
    assertRefused(command, 1, MAIN_CHECKOUT, POWERSHELL);
  }
});

test('refuses a command behind an @ that PowerShell does not open as a here-string', () => {
  const texts = [
    "a@'\n'; terraform apply\n'@'",
    'a@"\n"; terraform apply\n"@"',
    "a=@'\n'; terraform apply\n'@'",
    "--x=@'\n'; terraform apply\n'@'",
    "-m=@'\n'; terraform apply\n'@'",
  ];
  for (const text of texts) {
    assertRefused(`write-output ${text}`, 1, MAIN_CHECKOUT, POWERSHELL);
    assertRefused(`git commit -m ${text}`, 1, MAIN_CHECKOUT, POWERSHELL);
  }
  assertRefused("write-output ('{0}' -f@'\nit's\n'@); terraform apply; echo 'x'", 1, MAIN_CHECKOUT, POWERSHELL);
  assertRefused("git commit -m x@'\n'; terraform apply; echo '\n'@a", 1, MAIN_CHECKOUT, POWERSHELL);
});

test('refuses a command behind a here-string header blank', () => {
  for (const blank of ['\u00a0', '\v']) {
    assertRefused(`write-output @'${blank}\nit's\n'@; terraform apply; echo 'x'`, 1, MAIN_CHECKOUT, POWERSHELL);
  }
});

test('refuses a command behind curly quotes', () => {
  const pairs = [
    ...['\u2018', '\u2019', '\u201a', '\u201b'].map((curly) => ["'", curly]),
    ...['\u201c', '\u201d', '\u201e'].map((curly) => ['"', curly]),
  ];
  for (const [ascii, curly] of pairs) {
    const commands = [
      `write-output ${ascii}a${curly}; terraform apply; write-output ${ascii}b${ascii}`,
      `write-output ${curly}a${ascii}; terraform apply; write-output ${ascii}b${curly}`,
      `git commit -m ${ascii}a${curly}; terraform apply; ${curly}b${ascii}`,
    ];
    for (const command of commands) {
      assertRefused(command, 1, MAIN_CHECKOUT, POWERSHELL);
    }
  }
  for (const start of ['write-output', 'git commit -m']) {
    assertRefused(`${start} @'\nx\n\u2019@; terraform apply; write-output @'\ny\n'@`, 1, MAIN_CHECKOUT, POWERSHELL);
    assertRefused(`${start} @"\nx\n\u201d@; terraform apply; write-output @"\ny\n"@`, 1, MAIN_CHECKOUT, POWERSHELL);
  }
  assertRefused('write-output \u201c$(terraform apply)\u201d', 1, MAIN_CHECKOUT, POWERSHELL);
});

test('refuses a command behind an escape character or a comment', () => {
  for (const start of ['write-output', 'git commit -m']) {
    assertRefused(`${start} \`'; terraform apply; \`'`, 1, MAIN_CHECKOUT, POWERSHELL);
    assertRefused(`${start} x # it's\nterraform apply; echo 'y'`, 1, MAIN_CHECKOUT, POWERSHELL);
  }
  for (const start of ['echo', 'git commit -m']) {
    assertRefused(`${start} \\'; terraform apply; echo \\'`, 1, MAIN_CHECKOUT, BASH);
    assertRefused(`${start} x # it's\nterraform apply; echo 'y'`, 1, MAIN_CHECKOUT, BASH);
  }
  assertRefused('git commit -m "a`""; terraform apply; echo `"', 1, MAIN_CHECKOUT, POWERSHELL);
  assertRefused('git commit -m "a`" -m "; terraform apply; echo `"', 1, MAIN_CHECKOUT, POWERSHELL);
  assertRefused('git commit -m "a\\""; terraform apply; echo \\"', 1, MAIN_CHECKOUT, BASH);
});

test('reads @ quotes as plain text in Bash', () => {
  for (const start of ['echo', 'git commit -m']) {
    assertRefused(`${start} @'\n'; terraform apply; echo '\n'@`, 1, MAIN_CHECKOUT, BASH);
  }
});

test('refuses aws at the start of any command, also in a command it cannot read', () => {
  assertRefused('cd infra\naws s3 ls', 3);
  const powershell = [
    'cd infra\raws s3 ls',
    'cd $HOME\naws s3 ls',
    'cd $HOME\raws s3 ls',
    'cd $HOME; aws s3 ls',
    'echo $HOME | aws s3 ls',
    '& aws s3 ls',
    '& {aws s3 ls}',
  ];
  for (const command of powershell) {
    assertRefused(command, 3, MAIN_CHECKOUT, POWERSHELL);
  }
  for (const command of ['cd $HOME && aws s3 ls', 'cd $HOME; aws s3 ls', 'echo `aws s3 ls`']) {
    assertRefused(command, 3, MAIN_CHECKOUT, BASH);
  }
});

test('refuses a command continued on the next line', () => {
  for (const [continuation, shells] of [['`', POWERSHELL], ['\\', BASH]]) {
    assertRefused(`terraform ${continuation}\napply`, 1, MAIN_CHECKOUT, shells);
    assertRefused(`git push origin ${continuation}\nmain --force`, 5, MAIN_CHECKOUT, shells);
    assertRefused(`git commit ${continuation}\n-m x --no-verify`, 6, MAIN_CHECKOUT, shells);
  }
});

test('refuses a force or skip flag written in quotes', () => {
  assertRefused('git push origin main "--force"', 5);
  assertRefused("git commit -m x '--no-verify'", 6);
});

test('refuses terraform in a worktree unless its subcommand is fmt', () => {
  assertRefused('terraform fmt -check; terraform validate', 2, WORKTREE);
  assertRefused('terraform validate "fmt"', 2, WORKTREE);
  assertAllowed('terraform -chdir=infra fmt -check', WORKTREE);
  assertAllowed('terraform.exe fmt -check', WORKTREE);
});

test('reads a commit message as text only when git starts the command', () => {
  assertRefused("powershell -Command git commit -m 'x; terraform apply'", 1);
});

test('keeps a -F message file visible to the rules', () => {
  assertRefused('git commit -F .env', 4);
});

test("leaves out only a commit's message", () => {
  assertRefused("git stash -m 'terraform apply'", 1);
});

test('checks the text inside a here-string', () => {
  assertRefused("Invoke-Expression @'\nterraform apply\n'@", 1, MAIN_CHECKOUT, POWERSHELL);
});

test('ends a word that begins with a quote at its closing quote in PowerShell', () => {
  assertRefused("git commit -m 'x'-n", 6, MAIN_CHECKOUT, POWERSHELL);
  assertRefused("git push origin 'main'--force", 5, MAIN_CHECKOUT, POWERSHELL);
});

test('reads a word after -m as the message only where git does', () => {
  assertRefused('git commit -m -m -n', 6);
  assertRefused('git commit -m -m .env', 4);
  assertRefused('git commit -m x >-m -n', 6);
  assertRefused('git --namespace -m commit --no-verify -m x', 6);
  assertRefused('git commit --trailer -m -n -m x', 6);
});

test('reads the arguments PowerShell 5.1 hands to a program', () => {
  const commands = [
    "git commit -m '' -m -n",
    `git commit -m 'a b" -n -m "c'`,
    "git commit -m 'p q\\' 'r -n -m s'",
    'git commit -m:-n',
    'git commit -F:-n',
  ];
  for (const command of commands) {
    assertRefused(command, 6, MAIN_CHECKOUT, POWERSHELL);
  }
});

test('reads 2>&1 as one redirection', () => {
  assertRefused('git commit -m 2>&1 -m -n', 6);
});
