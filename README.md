# Task API

A small task service, built for a take-home assignment: a NestJS REST API with three endpoints, a React page that uses it, one container on one AWS EC2 instance, and a GitHub Actions pipeline that tests, builds and deploys every push to `main`.

**Live:** https://k2sz13v8p1.execute-api.eu-north-1.amazonaws.com, and http://56.228.119.233, the instance itself on plain HTTP. Both serve the page at `/` and the API beside it.

- [The API and the page](#the-api-and-the-page)
- [Run it locally](#run-it-locally)
- [Tests and coverage](#tests-and-coverage)
- [How it is deployed](#how-it-is-deployed)
- [Assumptions](#assumptions)
- [Known limitations, and how I would complete them](#known-limitations-and-how-i-would-complete-them)
- [System Architecture](#system-architecture)
  - [Scalability: if traffic grew 10x tomorrow](#scalability-if-traffic-grew-10x-tomorrow)
  - [Observability: monitoring, error tracking and logs](#observability-monitoring-error-tracking-and-logs)
  - [AI utilization: how I used AI](#ai-utilization-how-i-used-ai)
- [Repository layout](#repository-layout)

## The API and the page

| Request | Answer |
|---|---|
| `GET /health` | `200 {"status":"ok","uptime":1234}`. `uptime` is whole seconds since the process started. |
| `GET /tasks` | `200` with a JSON array of tasks, oldest first; `[]` when there are none. |
| `POST /tasks` with `{"title":"Buy milk"}` | `201` with the created task. |
| `POST /tasks` with an invalid body | `400` with the framework's error body, for example `{"message":"title must not be empty","error":"Bad Request","statusCode":400}`. |

A task looks like `{"id":"<a UUID>","title":"Buy milk","createdAt":"2026-11-10T21:49:36.151Z"}`.

- The title must be a string. It is trimmed, must not be empty after trimming, and may have at most 200 characters. Every other field of the body is dropped.
- Only JSON bodies are parsed. A form body answers 400, and a JSON body over 100 kB answers 413.
- An unknown path answers 404, and so does a wrong method on a known path. A 500 never shows its cause to the client; the cause is logged with its stack.

The page lists the tasks, newest first, has a form to add one, and shows whether the API is up. It is one screen, built with React and Vite, and the API serves it from the same address.

## Run it locally

You need Node 24 (`.nvmrc`) and npm, and Docker for the first way below. Every command runs from the repository root, in PowerShell or bash alike. Install both packages from their lockfiles once:

```
npm run setup
```

### As it runs in production: one container

```
docker build -t tasks .
docker run --rm --name tasks -p 3000:3000 tasks
```

Open http://localhost:3000. The page and the API share that one address, as they do live. `docker stop tasks`, from a second terminal, stops it.

### For development: two terminals

The API, on port 3000 (or on `PORT` if you set it):

```
cd backend; npm run build; node dist/main.js
```

The page, with Vite's dev server, in a second terminal:

```
cd frontend; npm run dev
```

Open the address Vite prints, http://localhost:5173. Vite forwards `/tasks` and `/health` to the API on port 3000.

### Check a running copy

The container:

```
cd backend; npm run smoke -- http://localhost:3000
```

The development setup, through Vite:

```
cd backend; npm run smoke -- http://localhost:5173
```

The smoke script checks `/health`, `/tasks`, two invalid creates, the page at `/`, and that no response carries an `X-Powered-By` header. Given an address it creates no task. The same command checks the live site. Against the API alone on port 3000 it fails at the page, because `node dist/main.js` serves no page until the built page is in `backend/public`.

## Tests and coverage

```
npm test
```

runs the backend's and the frontend's tests.

```
npm run verify
```

runs the checks of the pipeline's `verify` job, without its audit, and stops at the first step that fails: the hooks' tests; then, for the backend, the format check, lint, type-check, tests with coverage, build, and the smoke script against the built server on a free port; then, for the frontend, the format check, lint, tests and the build, which type-checks.

**Backend.** The backend is tested in four layers: unit tests, HTTP tests against the real application with the data-access layer mocked, and one flow on the real in-memory store, all three with Jest; and the smoke script on the built output, in `verify`. `cd backend; npm test` runs the Jest tests. Jest prints the coverage table, and the run fails when statements, branches, functions or lines fall below 80%. The HTML report is written to `backend/coverage/lcov-report/index.html`.

**Frontend.** `cd frontend; npm test` runs the Vitest tests. The assignment makes them optional. I wrote the parts that hold logic test-first anyway, with Vitest and Testing Library: the API module, the two hooks, the form's validation and the list's states. There is no coverage gate on the frontend; layout is checked by hand at desktop and mobile widths.

## How it is deployed

```
me ──git push──► GitHub, on every push to main
                   1 verify   tests, lint, builds, audit; a failure stops here
                   2 image    build, smoke-test on the runner, push ──► ghcr.io/shlomi441/testassignment:<commit SHA>, public
                   3 deploy   SSH with the deploy key ──► EC2 t3.micro, Amazon Linux 2023, eu-north-1
                                                            docker pull <commit SHA>, no login
                                                            one container: NestJS on 3000, published on port 80,
                                                            serving /health, /tasks and the built page

browser ──https──► API Gateway (HTTP API) ──http──► the instance, port 80
browser ──http───────────────────────────────────► the instance, port 80
```

### Provisioning, once

The steps, in order, with the commands as I ran them in PowerShell. I did the ones that handle credentials by hand, because the AI tool I worked with never sees them: my AWS session, the deploy key and my GitHub settings. I also run `terraform apply` and `destroy` myself, after reading the plan.

1. **The AWS session.** `aws login`, a browser sign-in that lasts 12 hours. My account type gets command-line credentials this way, and Terraform's AWS provider reads them.
2. **The deploy key**, without a passphrase, because the pipeline uses it without a person:
   ```
   ssh-keygen -t ed25519 -f "$HOME\.ssh\tasks_deploy" -C "tasks deploy"
   ```
3. **The variable file** `infra/terraform.tfvars`, which git ignores, with one line: `public_key_path = "C:/Users/<you>/.ssh/tasks_deploy.pub"`.
4. **Terraform.** `terraform -chdir=infra init` and `terraform -chdir=infra plan`, then `terraform -chdir=infra apply`. The apply creates the key pair, the security group and its rules (80 and 22 in, everything out), the instance, the Elastic IP and the API Gateway, and prints the address and both URLs. The instance's first boot installs Docker and nothing else. T3 instances start in "unlimited" CPU credit mode, which bills sustained bursting; on a public endpoint paid from a fixed credit I set the mode to "standard".
5. **The host key**, about two minutes after the apply: `ssh-keyscan -t ed25519 <address>`.
6. **GitHub**, in the repository's settings, an environment named `prod` with the secret `DEPLOY_SSH_KEY` (the private key) and two variables: `DEPLOY_HOST` (the address) and `DEPLOY_KNOWN_HOSTS` (the line from step 5).
7. **A push to `main`** publishes the image and deploys it. The registry package is public from its first push, so there is no step for that.

`npm run verify:infra` checks the Terraform files locally (`fmt -check` and `validate`). On a fresh clone, `terraform -chdir=infra init` comes first.

To check that AWS holds only what my code defines: at the end of the DevOps stage, `terraform -chdir=infra plan` refreshed every resource and said "No changes. Your infrastructure matches the configuration." The AWS Tag Editor, searched for the project's tag, listed the same resources, plus the instance's root volume.

After the interview: `terraform -chdir=infra destroy`, delete the package in the registry, and remove the secret.

**Cost.** About $12 to $13 a month at AWS's list prices for Stockholm, paid from the account's credit: the t3.micro $7.88, the public IPv4 address $3.65, the disk under $1.50. API Gateway adds about $1 per million requests.

### What a push to `main` does

The workflow is `.github/workflows/ci.yml`: three jobs chained one after the other, each with a 10-minute limit. A pull request runs `verify` only.

1. **`verify`** installs both packages, runs `npm run verify`, and runs `npm audit --omit=dev --audit-level=high` in both packages.
2. **`image`** builds the image and tests it before it publishes it. It starts the container on the runner, runs the same smoke script I run on my laptop against it, and checks that `docker stop` ends with exit code 0, so the app stopped on its own and was not killed. Only then does it log in with the workflow's own short-lived token and push the image tagged with the commit SHA. The package is public: `docker pull ghcr.io/shlomi441/testassignment:<commit SHA>` works without a login.
3. **`deploy`** runs in the `prod` environment, one at a time, and a running deploy is never cancelled. It connects over SSH with the deploy key, checking the instance's pinned host key, and runs `infra/deploy.sh` there with the new image's name. The script pulls the image first, so a failed pull changes nothing. Then it stops the old container and starts the new one (`--restart unless-stopped`, `-p 80:3000`, `--memory 512m`, `--log-driver journald`), and retries `/health` for about 30 seconds. If the start or the health check fails, it starts the previous image again and fails the job. Last, the smoke script checks the public plain-HTTP address.

The health check retries on every error, not only on timeouts: on the first deploy the first probe got "connection reset" while Node was still starting, and without `--retry-all-errors` that deploy would have failed.

A deploy takes the site down for about two seconds, measured from the old container's stop to the new one's first healthy `/health` (1.9 and 2.0 seconds in two runs). The last push before this README took 34 seconds in `verify`, 33 in `image` and 11 in `deploy`.

**A failing test does not deploy, shown once on purpose.** I pushed a commit that breaks one test expectation (`b89f816`). Run [44144554386](https://github.com/shlomi441/Testassignment/actions/runs/44144554386) failed at `verify` on that test, and `image` and `deploy` were skipped. The live `/health` showed the same container running throughout: its uptime grew from 1297 to 2016 seconds over 12 minutes. The revert (`7eba18d`) went through the whole pipeline in run [44147249492](https://github.com/shlomi441/Testassignment/actions/runs/44147249492), and `/health` then showed a new container with an uptime of 26 seconds.

**The rollback, tested once.** I ran the deploy script by hand over SSH with an image that cannot answer `/health`. The previous version came back, and the script exited with code 1.

**The image.** One Dockerfile at the root builds in three stages: the backend, the frontend, and a runtime stage with the production dependencies, the compiled backend and the built page. It runs as the non-root `node` user on `node:24.22.3-trixie-slim` (Debian 13 with glibc), pinned by digest. I had planned 24.22.2, the version I had tried, but 24.22.3 came out as a security release with a fix in the HTTP/1 parser path, so the image moved to it. The start command is in exec form, `CMD ["node", "dist/main.js"]`, and I showed why it matters: with the shell form, `/bin/sh` became process 1, ignored the stop signal, and Docker had to kill the container (exit code 137). In exec form Node is process 1, closes in about 0.4 seconds and exits with 0.

### Choices that differ from the assignment's defaults

Two parts follow the assignment's defaults: the hosting (one EC2 instance behind a security group, with the infrastructure in Terraform) and the frontend stack (React with Vite, CSS Modules, and API calls in custom hooks). The rest differs:

- **The API's container also serves the frontend.** The assignment leaves frontend hosting open and names S3 with CloudFront as one possibility. One origin means no CORS code and no mixed content; one image means the page and the API cannot drift apart; and the pipeline needs no AWS credentials. The cost: a frontend-only change redeploys the API.
- **One Dockerfile at the repository root.** The assignment asks for a Dockerfile for the API. Mine also builds the frontend into the image, because the API serves it.
- **Port 80, not the API's own port.** The container listens on 3000, and the host publishes it on 80, so the address works in a browser without a port number.
- **GitHub Container Registry, public, tagged with the commit SHA.** The assignment leaves the registry open. Pushing uses the workflow's built-in token and the instance pulls without credentials, so neither side stores a registry secret.
- **The pipeline holds an SSH key and no AWS credentials.** The assignment says to store AWS credentials and SSH keys as CI secrets. The deploy makes no AWS API call, so there are no AWS credentials to store. My AWS account type cannot create the identity provider that GitHub's OIDC sign-in needs, so any AWS credential in CI would have been a long-lived access key.
- **HTTPS through an API Gateway HTTP API in front of the instance.** The assignment does not ask for HTTPS. Since Chrome 155 (October 2026), Chrome asks for permission before the first visit to any public site without HTTPS, and I own no domain name. API Gateway gives an HTTPS address on an AWS name and forwards every request to the instance. It is only the TLS front door; with my own domain I would put a certificate on a load balancer or a CDN. One Terraform variable, `enable_https`, switches it off, and the plain-HTTP address works either way.
- **No `HEALTHCHECK` in the Dockerfile.** On a single Docker host it changes a status column and nothing else. The deploy script and the pipeline check `/health` themselves.
- **Frontend tests, although the assignment makes them optional** (see [Tests and coverage](#tests-and-coverage)).
- **A data-fetching library inside the custom hooks.** The hooks use TanStack Query 5, so retries, caching and polling are settings and not code. Components never import the library; they see only what the hooks return. I changed two of its defaults on purpose. It retries a failed request three times by default, which shows the error state about seven seconds late. And it sends nothing while the browser reports itself offline, which would leave the health badge on "up". So automatic retries are off and every request is attempted, and a failure is visible at once.

## Assumptions

Where the assignment is unclear, I decided as follows.

1. `uptime` in `GET /health` is whole seconds since the process started. The assignment shows `1234` without a unit.
2. A task `id` is a UUID from Node's standard library. I read the assignment's `"a1b2c3"` as an illustration, not a format.
3. `createdAt` is an ISO 8601 timestamp in UTC with milliseconds, for example `2026-11-10T21:49:36.151Z`. The assignment's example has no milliseconds; both are valid.
4. `GET /tasks` returns tasks in creation order, oldest first. The assignment does not specify an order.
5. A title is trimmed before it is stored, and a title that is empty after trimming is invalid. The assignment says "non-empty string"; I treat whitespace only as empty.
6. A title longer than 200 characters is invalid. The assignment sets no limit; I added one so that a single request cannot store an arbitrarily large value.
7. Unknown fields in the `POST /tasks` body are ignored. Only `title` is read.
8. The service keeps the newest 100 tasks and drops the oldest when a new one arrives. A public write endpoint in front of an in-memory store needs a limit. Dropping the oldest, instead of rejecting new tasks, keeps "add a task and see it appear" working for every reviewer.
9. The health indicator checks on load, every 10 seconds while the tab is visible, and again when the tab becomes visible. "Up" means `GET /health` answered 200 with `status: "ok"`. Anything else, including no answer, is "down". Before the first answer it shows "checking".
10. The page lists the newest task first. The API keeps returning the oldest first (assumption 4).
11. In the form, the title is trimmed; an empty result shows "Title is required" and sends nothing. The input accepts at most 200 characters. The server stays the authority on validity.
12. After a successful create, the form clears and the new task appears from the API's response, without loading the list again. A failed create shows the API's message next to the form and keeps the text.
13. A failed load shows an alert with the reason and a Retry button.
14. The task list is loaded again when the tab regains focus. A failed reload shows the error state with the Retry button.
15. A health check that gets no answer within 5 seconds counts as "down". `/health` answers in milliseconds, so 5 seconds leaves room for a slow network and still shows a silent API as "down" quickly.

## Known limitations, and how I would complete them

**Data and the API**

- **The store is in memory.** Every restart and every deploy empties it, and the service can run as one instance only. This is the assignment's permitted simple option. The next step is a real database; see [If traffic grew 10x tomorrow](#scalability-if-traffic-grew-10x-tomorrow).
- **The store keeps the newest 100 tasks, and there is no rate limiting.** The first place for rate limiting is API Gateway's throttling settings, since the gateway is already in front; a throttling module in the app is the alternative.
- **Tasks can't be deleted or edited.** The assignment asks for three endpoints and a page that lists and creates tasks, and says the feature set is deliberately small, so I spent the time on depth instead. The next step would be `DELETE /tasks/:id` (204, or 404 for an unknown id) and a remove button that updates the list the same way the create does.
- **`GET /health` reports liveness only.** There is no dependency to check while the store is in memory. With a database it would split into liveness and readiness.
- **An aborted request is logged with `"status": 200`.** When a client hangs up before the API answers, 200 is Node's default for a response that was never sent. The line also says `"aborted": true`, and that is the field to read.
- **Static files are checked before the API routes.** Every API `GET` costs one failed file lookup, and a built file named like an API path would shadow the route. The build emits only `index.html` and `assets/`. The fix is an `/api` prefix for the API.
- **Static files are served uncompressed, and revalidated on every load.** The CDN step in the 10x answer fixes the caching: the page's files in object storage behind CloudFront, with long-lived caching for the hashed files.

**Deploy and operations**

- **Every deploy costs about two seconds of downtime and empties the task list.** A rollback restores the previous code, not data. Rolling deploys behind a load balancer remove the downtime, and a database keeps the data.
- **The rollback covers a new container that does not start, or does not answer `/health` within about 30 seconds.** It does not cover a health check that gets no reply at all (curl has no time limit per attempt, so the job's 10-minute limit ends it), or an SSH session that drops in the middle of a deploy. And if the public smoke check fails after the health check passed, the job is red but the new version stays live. In each case the same image has already passed the full smoke test on the runner, and every image stays in the registry under its commit SHA, so re-running an older run's `deploy` job brings that version back.
- **One instance in one availability zone.** Nothing replaces it if it dies. See the 10x answer.
- **Port 22 is open to the internet,** because GitHub's runners have no fixed addresses. Login is by key only. The deploy key gives a full shell on the instance, not only the right to deploy; binding it to a single forced command is the next hardening step.
- **HTTPS ends at API Gateway.** From the gateway to the instance a request travels as plain HTTP, and port 80 stays open to everyone. With a domain I would put the certificate on the instance itself or on a load balancer, and redirect port 80 to HTTPS.
- **The pipeline checks the plain-HTTP address after each deploy, not the HTTPS one.** I checked HTTPS by hand after switching it on. A pipeline check would need one more GitHub variable.

**Infrastructure**

- **Terraform's state is a local file on my machine, and the network is the account's default VPC.** A team would keep the state in a shared backend with locking, and would define the VPC in code.
- **Two changes need more than `terraform apply`.** A change to the first-boot script replaces the instance: the new one has a new SSH host key and no container, so I would run `ssh-keyscan` again, update the `DEPLOY_KNOWN_HOSTS` variable and push. The plan shows it as "forces replacement" before I type yes. And rotating the deploy key through Terraform replaces only the key pair in AWS; the instance keeps trusting the old key until it is replaced.
- **`npm run verify:infra` fails on a fresh clone** until `terraform -chdir=infra init` has run.

**Logs and the page**

- **Request logs stay on the instance,** in its system journal, and are lost with it. Nothing reports errors from the browser. See [Monitoring, error tracking and logs](#observability-monitoring-error-tracking-and-logs).
- **Frontend tests cover the parts that hold logic.** Layout and CSS are checked by hand at desktop and mobile widths.
- **Two open tabs do not see each other's tasks** until a tab regains focus.

## System Architecture

### Scalability: if traffic grew 10x tomorrow

The design starts from an in-memory store, so all state lives inside one process. That decides the order:

1. **Move the state out of the process first**, into a real database, before adding a second instance. With a database, `/health` splits into liveness and readiness.
2. **A second instance behind a load balancer**, with a certificate on my own domain. The image registry is already in place, so building and publishing the image need no change; the `deploy` job, which today updates one host over SSH, would have to deploy to every instance. Deploys become rolling, and the seconds of downtime per deploy disappear.
3. **Static files to object storage behind CloudFront**, with long-lived caching for the hashed files.
4. **Rate limiting** in API Gateway's throttling settings, since the gateway is already in front.
5. **Retries in the browser.** They are off today, so a failure is visible at once; the Retry button and the 10-second health check are the retries. Behind a load balancer with several instances, where failures become transient, I would turn on one or two automatic retries for GET requests, and never for POST without an idempotency key.
6. **Infrastructure for a team:** Terraform's state in a shared backend with locking, and an explicit VPC in code.

### Observability: monitoring, error tracking and logs

**What exists today.** Every request produces one JSON line through the framework's own logger, written when the response closes:

```
{"level":"log","pid":2386,"timestamp":1794347376139,"message":{"method":"GET","path":"/health","status":200,"durationMs":5,"aborted":false},"context":"HTTP"}
```

The logger is a plain function registered with `app.use()` before the application starts. That way it also sees requests that the JSON body parser rejects first, such as malformed JSON or an oversized body. The AI's first plan bound it through a Nest module, and its own experiment showed that such requests then produce no line. Unexpected errors land in the same stream with their stack; clients never see the cause of a 500. Bodies and headers are never logged.

On the instance, Docker's `journald` log driver writes these lines into the system journal. The instance has no IAM role, so nothing is shipped anywhere yet.

**Log aggregation.** The first step would be an instance role limited to one log group, and Docker's CloudWatch log driver instead of `journald`. Because each line is JSON, it can then be queried by field. A request ID in the log line would tie the lines of one request together.

**Monitoring.** Metrics and alarms: the instance's status checks, its CPU credit balance, and an external check of `/health`.

**Error tracking.** Today nothing reports errors from the browser, and the API's errors exist only as log lines. An error-tracking service would cover both.

### AI utilization: how I used AI

**Planning.** Before any project code, I worked through the assignment with Claude in four chat sessions. Together we kept a numbered decision log, designed the backend, the frontend, the hosting, the pipeline and the infrastructure, and planned how the build would run. Most of my toolchain (TypeScript 7, NestJS 12, Jest 30, Vite 8, Vitest 5) is newer than the AI's training data. So I required every fact to be checked against a live source before it was used: before each recommendation, the AI read the vendors' own pages that day and read tool versions from the npm registry and Git tags.

**Experiments, not memory.** Where a fact decided a design, the AI built a throwaway version in its own sandbox. It tried the planned backend stack, serving the page from the API process, the stop signal with the app as process 1, the frontend toolchain, and three ways to fetch data, measured against each other. None of that code is in this repository.

**The specification.** The plans became a private specification: numbered requirements with acceptance criteria, the decisions with their exact versions, and one file per slice of work.

**The build, with Claude Code.** The work was cut into small slices. For every slice:

- I approved a plan: the behaviours to prove as test names, the files and the commands.
- The tests were written first and seen failing, and the failing output was kept as evidence. Then came the least code that passed them.
- A second AI context, the `reviewer` subagent, read the staged change without having seen the first one's reasoning. It checked correctness and efficiency before anything else.
- I got a written explanation of every file and construct, and approved the finished slice. Then came one commit.

Each stage (backend, frontend, DevOps) closed with Claude Code's bundled code review over the whole stage. The reviews caught real faults before they shipped: the slice reviewer found a gap in my rollback (a failing `docker run` skipped it), and the frontend's stage review found four timing faults in the page.

**Parallel sessions.** The backend and the frontend were built in two separate git worktrees, each session changing only its own package. A lead session in the main checkout owned the root files, the pipeline and the infrastructure, merged the lanes' work by fast-forward, and pushed. Slices whose every decision was already made ran as two unattended chains, one per package. A fresh `implementer` subagent built each slice and the `reviewer` checked it, and I reviewed the commits before anything reached `main`.

**Guardrails.** They are all in this repository, in `CLAUDE.md` and `.claude/`:

- `.claude/settings.json` starts every session in plan mode, with Claude Code's automatic mode switched off. It denies `terraform apply` and `destroy`, every `aws` command, force pushes, and reading my `~/.ssh` and `~/.aws` folders. It asks me before every push, and before every command that adds or changes a dependency.
- Three hooks in `.claude/hooks/`, written test-first: a guard on shell commands; a commit gate that, before every `git commit` Claude Code runs, runs `verify` in each package that has staged files (and the hooks' own tests when a hook is staged) and refuses a failing commit; and a session-start hook that loads the current state.
- The hooks are a tripwire for mistakes, not a security boundary; the permission lists are the boundary. The commit gate is a Claude Code hook, not a git hook, so it binds only the AI's `git commit`. `git revert`, `cherry-pick`, `merge` and `rebase` commit without it, and after them the full `verify` is run by hand. The deliberate red commit was mine, made in a plain terminal, and for my commits the pipeline is the guard.
- I had the hooks redesigned once, after four fixes to their first version's quote handling each left a new way to hide a command. They now read a command as the shell will hand it to the program, which in Windows PowerShell 5.1 is not always what its own parser shows.

**What I kept out.** Agent teams, workflows, background sessions and `/loop` were each weighed and left out, because something simpler did their job here. Automatic memory is off. My specification, board, records and explanations live in a private notes folder next to the repository, with their own local history, and nothing private is in this repository. A session in a worktree cannot write into the main checkout anyway, so private files inside the repository folder would not have worked with parallel sessions.

**What only I do.** I run `aws login`, `ssh-keygen`, `terraform apply` and `destroy`, and I enter the secret and the variables in GitHub. I read the code in VS Code, with no AI features in the editor.

#### Three corrections

**TypeScript 7.** The AI recommended pinning TypeScript 6.0, because the usual Jest transformer (`ts-jest`) and the usual linter (`typescript-eslint`) cannot load TypeScript 7. I pushed back: use the current compiler and change the surrounding tools instead. The research then confirmed a workable TypeScript 7 toolchain (SWC for Jest, V8 coverage, oxlint), and the AI withdrew its recommendation. That toolchain is what this repository uses.

**HTTPS when CloudFront is not available.** The AI planned HTTPS through CloudFront, with plain HTTP as the only fallback. I asked for a plan that also works without CloudFront: new AWS accounts are often refused CloudFront until an account check completes, and my interview was days away. The AI then found a simpler route it had not offered before: an API Gateway HTTP API used as an HTTPS proxy in front of the instance, one Terraform resource. It changed its own recommendation, and that is the live HTTPS address today.

**The documentation was wrong, and the AI's first guess was right.** The AI's draft plan assumed that a container image pushed from a public repository is public. GitHub's documentation says a new package starts private and does not inherit the repository's visibility. I had that assumption corrected from the documentation, and the plan gained a manual step to switch the package to public. The first real push showed the opposite. The pull worked without a login, a request with no credentials at all answered 200, and the package page showed "Public". I accepted the evidence and removed the manual step. I trust the run over the documentation.

## Repository layout

```
backend/            the API: NestJS, Jest, an independent npm package
  src/              the controllers, the service, the repository, the validation pipe, the request logger
  test/             HTTP tests and one flow on the real store
  smoke.mjs         the smoke script, used locally and by the pipeline
frontend/           the page: React, Vite, Vitest, an independent npm package
  src/              the page, three components, two hooks, the API module
infra/              Terraform, the instance's first-boot script, and deploy.sh
Dockerfile          one image for the API and the page
.github/workflows/  the pipeline
package.json        scripts only: setup, test, test:hooks, verify, verify:infra
CLAUDE.md, .claude/ how the AI tool works in this repository: settings, hooks, rule files, subagents, skills
```
