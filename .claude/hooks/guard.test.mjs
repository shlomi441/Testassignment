import { test } from 'node:test';
import assert from 'node:assert/strict';
import { refusal } from './guard.mjs';
import { runHook } from './test-support.mjs';

const MAIN_CHECKOUT = 'C:\\repo';
const WORKTREE = 'C:\\repo\\.claude\\worktrees\\backend';

function assertRefused(command, rule, cwd = MAIN_CHECKOUT) {
  assert.match(refusal(command, cwd), new RegExp(`^guard rule ${rule}: `));
}

function assertAllowed(command, cwd = MAIN_CHECKOUT) {
  assert.equal(refusal(command, cwd), null);
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

test('allows a PowerShell here-string message with an apostrophe that mentions the flag', () => {
  const command = "git commit -m @'\nS9: don't use --no-verify\n'@";
  assert.equal(refusal(command, MAIN_CHECKOUT, 'PowerShell'), null);
  const { status } = runHook('guard.mjs', { tool_name: 'PowerShell', tool_input: { command }, cwd: MAIN_CHECKOUT });
  assert.equal(status, 0);
});

test('reads a PowerShell here-string only where PowerShell opens and closes one', () => {
  const commands = [
    "write-output a@'\n'; terraform apply\n'@'",
    'write-output a@"\n"; terraform apply\n"@"',
    "write-output @'\nx\r'@; terraform apply; write-output @'\n'@",
    'write-output @"\nx\r"@; terraform apply; write-output @"\n"@',
  ];
  for (const command of commands) {
    assert.match(refusal(command, MAIN_CHECKOUT, 'PowerShell'), /^guard rule 1: /);
  }
});

test('reads curly quotes as PowerShell does, so the command between them is still refused', () => {
  const commands = [
    ...['\u2018', '\u2019', '\u201a', '\u201b'].flatMap((quote) => [
      `write-output 'a${quote}; terraform apply; write-output 'b'`,
      `write-output ${quote}a'; terraform apply; write-output 'b${quote}`,
    ]),
    ...['\u201c', '\u201d', '\u201e'].flatMap((quote) => [
      `write-output "a${quote}; terraform apply; write-output "b"`,
      `write-output ${quote}a"; terraform apply; write-output "b${quote}`,
    ]),
    "write-output @'\nx\n\u2019@; terraform apply; write-output @'\n'@",
    'write-output @"\nx\n\u201d@; terraform apply; write-output @"\n"@',
  ];
  for (const command of commands) {
    assert.match(refusal(command, MAIN_CHECKOUT, 'PowerShell'), /^guard rule 1: /, JSON.stringify(command));
  }
});

test('reads @ quotes as plain text in Bash, so the command between them is still refused', () => {
  assert.match(refusal("echo @'\n'; terraform apply; echo '\n'@", MAIN_CHECKOUT, 'Bash'), /^guard rule 1: /);
});

test('allows an ordinary command', () => {
  assertAllowed('npm run verify');
  assertAllowed('npm run verify', WORKTREE);
  const { status, stderr } = runHook('guard.mjs', { tool_input: { command: 'npm run verify' }, cwd: MAIN_CHECKOUT });
  assert.deepEqual({ status, stderr }, { status: 0, stderr: '' });
});

test('exits 2 with the reason on standard error', () => {
  const result = runHook('guard.mjs', { tool_input: { command: 'terraform apply' }, cwd: MAIN_CHECKOUT });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /^guard rule 1: /);
});
