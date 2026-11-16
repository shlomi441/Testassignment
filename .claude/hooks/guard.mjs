import { readFileSync } from 'node:fs';

const QUOTED = /"[^"]*"|'[^']*'/g;
// PowerShell reads the curly quotes as quotes too, and only it has `@'...'@` here-strings, whose
// text may hold quote characters; in Bash both are plain text. Where the pattern chooses, it reads
// less as a string than PowerShell does, so the rest stays visible to the rules. It is no
// tokenizer: a backtick escape, a comment or a `$(...)` inside a string is read as string text.
const SINGLE = String.raw`'\u2018-\u201b`;
const DOUBLE = String.raw`"\u201c-\u201e`;
const QUOTED_IN_POWERSHELL = new RegExp(
  [
    String.raw`(?<!\S)@[${SINGLE}][ \t]*\r?\n[\s\S]*?[\r\n][${SINGLE}]@`,
    String.raw`(?<!\S)@[${DOUBLE}][ \t]*\r?\n[\s\S]*?[\r\n][${DOUBLE}]@`,
    `[${DOUBLE}][^${DOUBLE}]*[${DOUBLE}]`,
    `[${SINGLE}][^${SINGLE}]*[${SINGLE}]`,
  ].join('|'),
  'g',
);
const SECRET_PATH = /(?<!\w)\.(ssh|aws|env)\b|\.pem\b|\bid_(ed25519|rsa)\b|\.tf(state|vars)\b/;

export function withoutQuotes(command, tool) {
  return command.replace(tool === 'PowerShell' ? QUOTED_IN_POWERSHELL : QUOTED, '""');
}

export function refusal(command, cwd, tool) {
  const text = command.toLowerCase();
  const bare = withoutQuotes(text, tool);
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
  const { tool_name, tool_input, cwd } = JSON.parse(readFileSync(0, 'utf8'));
  const reason = refusal(tool_input.command, cwd, tool_name);
  if (reason) {
    console.error(reason);
    process.exitCode = 2;
  }
}
