import { readFileSync } from 'node:fs';
import { readCommands, readGit } from './read-command.mjs';

const SECRET_PATH = /(?<!\w)\.(ssh|aws|env)\b|\.pem\b|\bid_(ed25519|rsa)\b|\.tf(state|vars)\b/;

// Another option could take -m as its value, so a message is certain only when every option of the
// commit is -m followed by its message.
function onlyMessages(options) {
  return options.every((word, index) => index % 2 === 1 || word === '-m');
}

// The rules see every word a program receives. Only the messages of a commit that git itself starts
// are left out: they are literal text for git, and any other program could run them as code.
function textsToCheck(command, shell) {
  const commands = readCommands(command, shell);
  if (!commands) return [command];
  return commands.map((words) => {
    const git = readGit(words);
    const messages = git?.at === 0 && git.commit && onlyMessages(git.options);
    return (messages ? words.slice(0, words.length - git.options.length) : words).join(' ');
  });
}

function brokenRule(text, inWorktree) {
  const rules = [
    [/\bterraform\b[\s\S]*\b(apply|destroy)\b/.test(text), 'terraform apply and destroy are run by the author only'],
    [
      inWorktree && /\bterraform(\.exe)?(?![\w.])(?!(\s+-\S+)*\s+fmt\b)/.test(text),
      'terraform runs only in the main checkout; a worktree may run terraform fmt',
    ],
    [/(^|[;&|({\r\n`])\s*aws\b/.test(text), 'aws commands are run by the author only'],
    [SECRET_PATH.test(text), 'keys, .env files and Terraform state and variable files are never read'],
    [/\bgit\b[\s\S]*\bpush\b[\s\S]*\s(--force|-[a-z]*f)/.test(text), 'git push is never forced'],
    [/\bgit\b[\s\S]*\bcommit\b[\s\S]*\s(--no-verify|-[a-z]*n)/.test(text), 'git commit never skips its checks'],
  ];
  const broken = rules.findIndex(([refused]) => refused);
  return broken === -1 ? null : `guard rule ${broken + 1}: ${rules[broken][1]}.`;
}

export function refusal(command, cwd, shell) {
  const inWorktree = /[\\/]\.claude[\\/]worktrees[\\/]/.test(cwd);
  for (const text of textsToCheck(command, shell)) {
    const reason = brokenRule(text.toLowerCase(), inWorktree);
    if (reason) return reason;
  }
  return null;
}

if (import.meta.main) {
  const { tool_name, tool_input, cwd } = JSON.parse(readFileSync(0, 'utf8'));
  const reason = refusal(tool_input.command, cwd, tool_name);
  if (reason) {
    console.error(reason);
    process.exitCode = 2;
  }
}
