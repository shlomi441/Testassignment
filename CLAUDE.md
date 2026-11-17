# Task API

A take-home assignment, built in small tested slices: a NestJS REST API (`GET /health`, `GET /tasks`, `POST /tasks`), a React page that uses it, one container on one AWS instance, and a GitHub Actions pipeline that tests, builds and deploys on every push to `main`.

The author has to be able to explain every line of this repository. That decides how you work here: tests first, the least code that passes them, a written explanation for every slice, and a question whenever something is not decided.

This file is context, not enforcement. Every hard rule in it also exists as a permission rule in `.claude/settings.json`, as a hook in `.claude/hooks/`, or as a script.

## Where things are

- `backend/`: the API, an independent npm package (NestJS, Jest).
- `frontend/`: the page, an independent npm package (React, Vite, Vitest).
- `infra/`, `Dockerfile`, `.dockerignore`, `.github/workflows/`: infrastructure code, image and pipeline.
- `package.json` at the root: scripts only. It never gets dependencies or workspaces.
- `.claude/`: settings, rule files, the subagents `reviewer` and `implementer`, the skills `/slice`, `/chain` and `/integrate`, and the hooks.
- The notes folder: private, next to the main checkout, named after it with `-notes` appended. `git worktree list` prints the main checkout first. It holds `spec/requirements.md`, `spec/design.md`, `spec/slices/<id>.md`, `board.md`, `state/<seat>.md`, `records/<id>.md`, `explanations/<id>.md`, `EXPLANATIONS.md` and `README_NOTES.md`.

The specification in the notes folder is the source of truth for behaviour. It changes only by the author's ruling, never to match the code. Nothing from the notes folder goes into this repository, a commit message or a log.

## The toolchain is newer than your training data

TypeScript 7 (the native compiler), NestJS 12 (ES-module packages), Jest 30 with SWC, oxlint with tsgolint, Vite 8, Vitest 5, TanStack Query 5, Terraform 1.17 and the v7 GitHub actions were released after most of what you know. Before you write or configure anything in an area, read its rule file: `.claude/rules/backend.md`, `.claude/rules/frontend.md` or `.claude/rules/infra.md`. They also load on their own when you touch a matching file. Where a rule file is silent, read the installed package or its current documentation. Do not answer from memory.

## Commands

- Root: `npm run setup` (clean install of both packages), `npm test`, `npm run verify` (everything), `npm run verify:infra` (Terraform format and validation; main checkout only).
- Each package: `format`, `format:check`, `lint`, `test`, `build` and `verify`. `verify` is the check that counts: format check, lint, type-check, tests and build.
- Run a package script as one command from the checkout root: `cd backend; npm run verify`. The primary shell on this machine is Windows PowerShell 5.1, which has no `&&`. In a subagent every command starts in the checkout root again.
- Run git from the checkout root, never after a `cd`. Stage files by path. Never `git add -A` or `git add .` in this repository.
- Tests run only through the npm scripts. `npx` asks first, and a bare `npx jest` fails on NestJS 12.
- Print the output of `verify`; do not summarise it. Some tools print nothing on success, so the exit code is the result.

## Seats

Three sessions exist at most. Every slice file says where its slice runs.

- Lead seat: a session in the main checkout. It runs setup, everything whose test is a push, everything that owns Terraform's state, integration and the documents. It writes no backend or frontend code.
- Backend lane (`claude --worktree backend`) and frontend lane (`claude --worktree frontend`): one worktree each, on the branch `worktree-<lane>`. A lane changes only its own package folder. Root files, `.github/`, `infra/`, `Dockerfile` and `.claude/` belong to the lead seat.
- Terraform runs only in the main checkout. A worktree is deleted one day, and a state file inside it would be deleted with it.
- A lane's work reaches `main` only by fast-forward, done in the lead seat with `/integrate`.
- One writer per notes file. A seat writes its own `state/<seat>.md` and the records and explanations of the slices it builds. Only the lead seat writes `board.md`, `EXPLANATIONS.md` and `README_NOTES.md`; a lane proposes README notes inside its record.

## How a slice is built

The author starts every piece of work: `/slice <id>` (one attended slice), `/chain <lane>` (the unattended chain of a lane) or `/integrate <seat>` (lead seat). The procedure is `.claude/skills/slice/procedure.md`. In short:

1. Plan gate, in plan mode, before any file changes: the author approves the behaviours to prove as test names, the files and the commands.
2. Red: write the tests and run them. Each has to fail for the reason its name gives, on an assertion and not on a missing import. The failing output goes into the slice's record.
3. Green: the least code that passes, written short and clean the first time.
4. Clean check, format, `verify`, the `reviewer` subagent, then the record and the explanation.
5. Done gate: the author reads the diff, the evidence and the explanation, and approves. Only then is the slice committed: one commit per slice, message `<id>: <what the slice delivers>`, with the co-author line kept.

A meaningful test asserts behaviour that a caller or a user can observe, was seen failing first, would fail if that behaviour broke, repeats no other test and does not test the framework. No "should be defined" tests, no snapshots, no assertion that is always true.

A slice without its explanation file is not done. The explanation says what every file and construct does, why it is done this way, what was rejected, the Java/Spring analogy and where it breaks, what went wrong on the way, and three questions an interviewer could ask.

## Stop and ask

Stop, change nothing further and ask the author when one of these happens. In a chain, the chain stops at that slice and starts nothing after it.

- A new dependency, or another version of an approved one.
- A departure from a decision in `spec/design.md` or from the slice's specification.
- Something the assignment leaves unclear that no approved assumption covers.
- Anything that touches credentials, GitHub settings or AWS.
- The same failure twice.
- A rebase conflict.

A file outside the plan is not a question: name it in the done summary. Put a question in this form: what is needed, the options, your recommendation, the trade-offs and side effects, and a Java/Spring analogy where one helps.

## What never happens

- You never read `~/.ssh` or `~/.aws`, key files, `.env` files or Terraform state files, and you never print a secret.
- You never run `terraform apply` or `terraform destroy`, and never an `aws` command. You may run `terraform fmt` and `validate`, and `plan` after asking.
- You never run `git push --force` or `git commit --no-verify`. `git push` asks every time; once the deploy job exists, a push to `main` is a deployment.
- The author runs `aws login`, `ssh-keygen`, `terraform apply` and `destroy`, and enters the secret and the variables in GitHub.
- You never change `.claude/settings.json` or a hook to get past a refusal. A refusal is a result: report it.

## Code rules

1. No file, function, parameter, option, type or dependency without a test or a caller that needs it today.
2. The standard library and the framework's own feature come before new code.
3. No branch, fallback or default that no test exercises.
4. Names explain; comments say only why.
5. No dead code, no commented-out code, no leftover TODO.
6. One way to do each thing.
7. Yardsticks: about 140 lines of production code for the backend and about 170 for the frontend. A slice that needs clearly more stops and asks.
8. Lint warnings are warnings. They do not fail the run, they are listed in the slice's record, and they are fixed in slice R2. One rule is an error: `typescript/no-floating-promises`. There is no `--deny-warnings`.

## README notes

Propose an entry for `README_NOTES.md`, in the author's first person and with a date, whenever: the AI is corrected, overruled or made to justify itself; an assumption is made because the assignment is unclear; a choice departs from one of the assignment's default options; a finding about a tool, a version or AWS changes a decision; something is left unfinished or knowingly simplified; an important decision is made or changed. A lane writes the proposal into its record. The lead seat writes the file.
