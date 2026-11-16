---
paths:
  - "backend/**"
---

# Backend: toolchain facts

Checked against live sources and by experiment on 2026-11-10 and 2026-11-11. These tools are newer than your training data. Where this file and your memory disagree, this file is right. Where it is silent, read the installed package or its current documentation.

## Versions

Exact versions in `package.json`, the lockfile committed, `npm ci` everywhere. A new package or another version is a stop-and-ask.

- Runtime (5): `@nestjs/common`, `@nestjs/core` and `@nestjs/platform-express` 12.4.2, `reflect-metadata` 0.2.2, `rxjs` 7.8.2. NestJS 12 brings Express 5.3.
- Development (13): `typescript` 7.0.2, `@types/node` 24.19.2, `@types/express` 5.0.6, `jest` and `@jest/globals` 30.5.2, `@swc/core` 1.16.22, `@swc/jest` 0.2.39, `@nestjs/testing` 12.4.2, `supertest` 7.3.2, `@types/supertest` 7.2.1, `oxlint` 1.93.0, `oxlint-tsgolint` 7.0.2006, `prettier` 3.9.10.
- Ask for `@types/node@24` explicitly. The default tag is the 26 line.
- Node: 24.15.0 on the development machine and 24.22.2 in the image. The pipeline takes the newest 24.x, because `.nvmrc` names the major only. When the machine and the pipeline disagree, this gap is the first suspect.
- `@swc/core` is a native binary per platform. The lockfile has to install on Windows and on Linux. Never edit the lockfile by hand.

Not used, each rejected for a recorded reason: the Nest CLI, `nest new` and `@nestjs/schematics` (they need TypeScript 6); `ts-jest` and `typescript-eslint` (they cannot load TypeScript 7); `babel-jest` (Jest 30 does not resolve against Babel 8); ESLint, Biome, `ts-node`, `class-validator`, `class-transformer`, `zod`, `@nestjs/serve-static`, `@nestjs/config`, `@nestjs/terminus`, `helmet`, `@nestjs/throttler`, `uuid`, `nanoid`, `pino`, `winston`, `morgan`, `dotenv`, `@types/jest`.

## Compiler

- TypeScript 7 is the native compiler. `tsc` builds; there is no programmatic API in 7.0.
- CommonJS output: `module: nodenext` and `moduleResolution: nodenext`, with no `"type"` field in `package.json`. The source still uses `import` and `export`.
- Set `rootDir` and `types` explicitly. In TypeScript 7 `rootDir` defaults to the tsconfig folder, `types` defaults to an empty list, and `strict` defaults to true.
- Removed in TypeScript 7 and hard errors now: `moduleResolution` `node`, `node10` and `classic`; `baseUrl`; `target` `es5`; `module` `amd`, `umd`, `system` and `none`; `downlevelIteration`.
- NestJS needs `experimentalDecorators` and `emitDecoratorMetadata`. `erasableSyntaxOnly` cannot be combined with them.
- `isolatedModules: true` makes `tsc` reject what a per-file compiler such as SWC cannot convert, so the two compilers stay in agreement. `target: es2024` matches what Node 24 runs.
- Two files: `tsconfig.json` type-checks `src` and `test` with `noEmit`, and takes in `smoke.mjs` through `allowJs` for the linter only: without `checkJs`, `tsc` reports no type error in it, so the TS2801 check below does not cover it. `tsconfig.build.json` extends it, sets `rootDir: ./src` and `outDir: ./dist`, includes `src` and excludes `src/**/*.spec.ts`.
- Build: `tsc -p tsconfig.build.json`. Type-check: `tsc -p tsconfig.json`. Run: `node dist/main.js`. No flag is needed to run the built app.

## Jest

- NestJS 12 ships ES modules only. Plain Jest fails on them with "Must use import to load ES Module". The test script is `node --experimental-vm-modules node_modules/jest/bin/jest.js --coverage`. Written like this it needs no environment-variable syntax, so it is the same in PowerShell and in the pipeline.
- The fallback ladder is decided, and steps 2 and 3 are a stop-and-ask: (1) the flag above; (2) no flag, and Jest compiles Nest's packages: `transform: { '^.+\\.(t|j)s$': '@swc/jest' }` with `transformIgnorePatterns: ['/node_modules/(?!(@nestjs)/)']`; (3) NestJS 11.
- Transformer: `@swc/jest`. `.swcrc`: `jsc.parser` with `syntax: "typescript"` and `decorators: true`; `jsc.transform` with `legacyDecorator: true` and `decoratorMetadata: true`; `jsc.keepClassNames: true`.
- `jest.config.js`: `testEnvironment: 'node'`; `roots` `<rootDir>/src` and `<rootDir>/test`; `testRegex: '\\.spec\\.ts$'`; `transform: { '^.+\\.ts$': '@swc/jest' }`; `collectCoverageFrom: ['src/**/*.ts', '!src/**/*.spec.ts']`; `coverageProvider: 'v8'`; a global `coverageThreshold` of 80 for statements, branches, functions and lines. No coverage exclusions.
- SWC does not type-check. The type-check is its own step in `verify`.
- V8 coverage reports a file that no test loads as 0% and counts every `??` fallback as a branch. So: no file that holds only types (the `Task` type lives beside the repository contract), and no fallback without a test. `main.ts` stays in the figures at 0%; the smoke test covers it outside Jest.

## Tests

- Import `describe`, `it`, `expect`, `jest` and the rest from `@jest/globals`. There is no `@types/jest`.
- No `jest.mock`: it does not apply to ES modules. Pass fakes in through constructors and through `overrideProvider`.
- Write mocks as standalone constants, `const create = jest.fn<TaskRepository['create']>()`. `expect(mock.method)` on a `jest.Mocked<T>` object triggers the type-aware lint rule `typescript/unbound-method`.
- Unit specs sit beside their source as `*.spec.ts`. HTTP tests live in `backend/test/`.
- HTTP tests build the real `AppModule` with `Test.createTestingModule`, override the repository with `overrideProvider(TaskRepository).useValue(...)`, call the same `configureApp(app)` as `main.ts`, and drive the app with `supertest` (`import request from 'supertest'`).
- Observe log lines by swapping the logger: `app.useLogger(fake)`.
- Jest fake timers control both `Date` and `performance.now()`, also in an `async` test.

## NestJS 12 behaviour that the design relies on

- Dependency injection reads constructor parameter types from emitted metadata. A class used as an injection token is imported as a value, never with `import type`. The abstract class `TaskRepository` is both the contract and the token: `{ provide: TaskRepository, useClass: InMemoryTaskRepository }`.
- There is no component scanning. A class that is not listed in the module does not exist for the container.
- Register the request logger with `app.use()` before the app starts, never through a module's `consumer.apply()`. Requests rejected before routing (malformed JSON, a body over 100 kB, bad percent-encoding) never reach module-bound middleware.
- Log on the response's `close` event. A completed response emits `finish` and then `close`; an aborted request emits only `close`, with `writableFinished` false.
- `new ConsoleLogger({ json: true })` prints one JSON line per call. An object passed as the message is nested under `message`.
- Type the app as `NestExpressApplication`. `app.useStaticAssets(dir)` needs no extra package. Register it after the logger, or static requests are not logged. A missing folder does not stop the app.
- `app.disable('x-powered-by')` removes the `X-Powered-By` header.
- `app.enableShutdownHooks()` belongs in `main.ts`. Without it the app ignores the stop signal when it runs as process 1 in a container. With it, an in-flight request completes; the exit code is 0 as process 1 and 143 outside a container.
- Built-in error bodies are kept. A wrong method on a known path answers 404, not 405. On Express 5 `req.body` is undefined unless a parser handled the request.
- Express 5 wildcards are named, for example `{*splat}`.

## Lint and format

- `oxlint --type-aware src test smoke.mjs`. It needs the paths as arguments, and `oxlint-tsgolint` supplies the type-aware rules. A type-aware rule reaches only files in the tsconfig program: a lint path alone, or an `include` entry without `allowJs`, leaves a `.mjs` file outside the type-aware rules, `typescript/no-floating-promises` among them, and prints nothing.
- Under a coding agent oxlint prints nothing when it finds nothing. The exit code is the result.
- Warnings do not fail the run. One rule is set to `error` in `.oxlintrc.json`: `typescript/no-floating-promises`. There is no `--deny-warnings`.
- A promise used as a condition is reported by the compiler itself (TS2801), not by the linter.
- Prettier formats. `.gitattributes` keeps line endings at LF, so `prettier --check` gives the same answer on Windows and Linux.

## Audit

On 2026-11-10 `npm audit` found the production tree clean and 19 low or moderate advisories in Jest's own dependency tree (minimatch, glob, deepmerge). Those are development-only and never reach the image. The pipeline's gate is `npm audit --omit=dev --audit-level=high`.
