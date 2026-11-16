import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { withoutQuotes } from './guard.mjs';

const VALUE = String.raw`(?:[^\s"']|"[^"]*"|'[^']*')+`;
const OPTION = String.raw`-c\s+${VALUE}|-${VALUE}`;
const GIT_COMMIT = new RegExp(String.raw`\bgit(?:\.exe)?((?:\s+(?:${OPTION}))*)\s+commit\b(.*)`, 'i');
const OUTPUT_LINES = 30;

export function readCommit(command, tool) {
  const bare = withoutQuotes(command, tool);
  const commit = bare.match(GIT_COMMIT);
  if (!commit) return null;
  if (/;|&&|\||\n/.test(bare)) {
    return { refusal: 'a git commit has to be a command of its own: finish staging, then commit' };
  }
  if (/\s(-[a-z]*a|--all\b)/.test(commit[2])) {
    return { refusal: 'commit -a or --all is refused: stage by path, then commit what is staged' };
  }
  const [, options] = command.match(GIT_COMMIT);
  const directory = options.match(new RegExp(String.raw`-C\s+(${VALUE})`))?.[1].replace(/^(["'])(.*)\1$/, '$2');
  return { directory };
}

export function checksFor(staged, top) {
  const checks = ['backend', 'frontend']
    .filter((folder) => staged.some((file) => file.startsWith(`${folder}/`)))
    .filter((folder) => existsSync(join(top, folder, 'package.json')))
    .map((folder) => ({ folder, script: 'verify' }));
  if (staged.some((file) => file.startsWith('.claude/hooks/'))) checks.push({ folder: '', script: 'test:hooks' });
  return checks;
}

function refuse(reason) {
  console.error(`commit-gate: ${reason}`);
  process.exitCode = 2;
}

function gate({ tool_name, tool_input, cwd }) {
  const commit = readCommit(tool_input.command, tool_name);
  if (!commit) return;
  if (commit.refusal) return refuse(commit.refusal);
  const git = (...args) =>
    spawnSync('git', ['-C', commit.directory ?? '.', ...args], { cwd, encoding: 'utf8' }).stdout.trim();
  const top = git('rev-parse', '--show-toplevel');
  const passed = [];
  for (const { folder, script } of checksFor(git('diff', '--cached', '--name-only').split('\n'), top)) {
    const check = `npm run ${script} in ./${folder}`;
    const run = spawnSync(`npm run ${script}`, { cwd: join(top, folder), shell: true, encoding: 'utf8' });
    if (run.status !== 0) {
      const tail = `${run.stdout}${run.stderr}`.trim().split('\n').slice(-OUTPUT_LINES).join('\n');
      return refuse(`${check} failed:\n${tail}`);
    }
    passed.push(check);
  }
  const additionalContext = `commit-gate passed: ${passed.join(', ') || 'nothing to verify'}`;
  console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext } }));
}

if (import.meta.main) gate(JSON.parse(readFileSync(0, 'utf8')));
