import { readFileSync } from 'node:fs';

const QUOTED = /"[^"]*"|'[^']*'/g;
const SECRET_PATH = /(?<!\w)\.(ssh|aws|env)\b|\.pem\b|\bid_(ed25519|rsa)\b|\.tf(state|vars)\b/;

export function withoutQuotes(command) {
  return command.replace(QUOTED, '""');
}

export function refusal(command, cwd) {
  const text = command.toLowerCase();
  const bare = withoutQuotes(text);
  const inWorktree = /[\\/]\.claude[\\/]worktrees[\\/]/.test(cwd);
  const rules = [
    [/\bterraform\b.*\b(apply|destroy)\b/.test(bare), 'terraform apply and destroy are run by the author only'],
    [
      inWorktree && /\bterraform\b/.test(bare) && !/\bterraform\b.*\bfmt\b/.test(bare),
      'terraform runs only in the main checkout; a worktree may run terraform fmt',
    ],
    [/(^|[;&|(])\s*aws\b/.test(bare), 'aws commands are run by the author only'],
    [SECRET_PATH.test(text), 'keys, .env files and Terraform state and variable files are never read'],
    [/\bgit\b[^;&|\n]*\bpush\b[^;&|\n]*\s(--force|-[a-z]*f)/.test(bare), 'git push is never forced'],
    [/\bgit\b[^;&|\n]*\bcommit\b[^;&|\n]*\s(--no-verify|-[a-z]*n)/.test(bare), 'git commit never skips its checks'],
  ];
  const broken = rules.findIndex(([refused]) => refused);
  return broken === -1 ? null : `guard rule ${broken + 1}: ${rules[broken][1]}.`;
}

if (import.meta.main) {
  const { tool_input, cwd } = JSON.parse(readFileSync(0, 'utf8'));
  const reason = refusal(tool_input.command, cwd);
  if (reason) {
    console.error(reason);
    process.exitCode = 2;
  }
}
