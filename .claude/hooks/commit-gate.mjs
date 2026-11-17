import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readCommands, readGit } from './read-command.mjs';

const NAMES_A_COMMIT = /\bgit\b[\s\S]*\bcommit\b/i;
const OUTPUT_LINES = 30;

export function readCommit(command, shell) {
  const commands = readCommands(command, shell);
  if (!commands) {
    if (!NAMES_A_COMMIT.test(command)) return null;
    return { refusal: 'the commit gate could not read this command: write the commit as one plain git commit' };
  }
  const commits = commands.map(readGit).filter((git) => git?.commit);
  if (commits.length === 0) return null;
  if (commands.length > 1) {
    return { refusal: 'a git commit has to be a command of its own: finish staging, then commit' };
  }
  const [commit] = commits;
  if (commit.at !== 0) return { refusal: 'a git commit has to start the command: drop what stands before git' };
  if (commit.options.some((word) => /^(-[a-z]*a|--all\b)/.test(word))) {
    return { refusal: 'commit -a or --all is refused: stage by path, then commit what is staged' };
  }
  return { location: commit.location };
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
    spawnSync('git', [...commit.location, ...args], { cwd, encoding: 'utf8' }).stdout.trim();
  const top = git('rev-parse', '--show-toplevel');
  if (!top) return refuse('the checkout of this commit could not be found: check the folder it runs in or that -C names');
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
