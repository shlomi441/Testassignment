---
paths:
  - "frontend/**"
---

# Frontend: toolchain facts

Checked against live sources and by experiment on 2026-11-11. These tools are newer than your training data. Where this file and your memory disagree, this file is right. Where it is silent, read the installed package or its current documentation.

## Versions

Exact versions in `package.json`, the lockfile committed, `npm ci` everywhere. A new package or another version is a stop-and-ask.

- Runtime (3): `react` and `react-dom` 19.3.1, `@tanstack/react-query` 5.107.1.
- Development (13): `vite` 8.3.8, `@vitejs/plugin-react` 6.3.0, `typescript` 7.0.2, `@types/react` and `@types/react-dom` 19.3.0, `@types/node` 24.19.2, `oxlint` 1.93.0, `oxlint-tsgolint` 7.0.2006, `prettier` 3.9.10, `vitest` 5.1.0, `jsdom` 31.0.0, `@testing-library/react` 16.3.3, `@testing-library/dom` 10.4.2.
- Vite 8 builds with Rolldown. `@vitejs/plugin-react` 6 needs no Babel.

Not used: the `npm create vite` scaffold (the files are hand-written from the official template's settings), Next.js, a router, a global store, Tailwind, styled-components, a UI kit, Jest, `@testing-library/user-event`, `@testing-library/jest-dom`, a mock-server package, the TanStack devtools, persistence or lint plugin, SWR.

## Package and configuration

- `"type": "module"`. Scripts: `dev` (`vite`), `build` (`tsc -b && vite build`), `lint` (`oxlint --type-aware src`), `format`, `format:check`, `test` (`vitest run`) and `verify`.
- `tsconfig.json` only references `tsconfig.app.json` and `tsconfig.node.json`, as the official template has them.
- `tsconfig.app.json`: `target` es2023; `lib` ES2023 and DOM; `module` esnext; `types` `["vite/client"]`; `moduleResolution` bundler; `allowImportingTsExtensions`; `verbatimModuleSyntax`; `moduleDetection` force; `noEmit`; `jsx` react-jsx; `noUnusedLocals`; `noUnusedParameters`; `erasableSyntaxOnly`; `noFallthroughCasesInSwitch`; `skipLibCheck`; `allowArbitraryExtensions`.
- `tsconfig.node.json` covers `vite.config.ts` with `module` nodenext and `types` `["node"]`.
- `vite.config.ts` imports `defineConfig` from `vitest/config`, uses the React plugin, forwards `/tasks` and `/health` to `http://localhost:3000` in the dev server, and sets `test: { environment: 'jsdom', setupFiles: ['src/test-setup.ts'] }`.
- The page and the API share one origin. Every request URL is relative.
- The build writes `dist/`: `index.html`, and one hashed JavaScript file and one hashed stylesheet under `assets/`. There is no favicon. The API's container serves that folder at `/`, so no file in the build output may be named `health` or `tasks`: those paths belong to the API.

## Lint

- `.oxlintrc.json`: the template's plugins `react`, `typescript` and `oxc`, plus `jsx-a11y`. Rules: `react/rules-of-hooks` error; `react/only-export-components` warn with `allowConstantExport`; `typescript/no-floating-promises` error.
- The script names `src`, because without a `.gitignore` beside it oxlint walks into `node_modules`.
- Under a coding agent oxlint prints nothing when it finds nothing. The exit code is the result.
- Warnings do not fail the run. There is no `--deny-warnings`.
- `jsx-a11y` prefers an `<output>` element over `role="status"`.
- `react(set-state-in-effect)` fires on an effect that calls a state-setting function. The two hooks contain no effects, so the rule has nothing to say about them.

## Data fetching: TanStack Query 5

- Only `src/hooks/useTasks.ts`, `src/hooks/useHealth.ts`, `src/queryClient.ts`, `src/main.tsx` and one test helper import `@tanstack/react-query`. Components and their tests never do.
- `src/queryClient.ts` exports the one function that creates the client with the defaults below. `main.tsx` and the test wrapper both call it, so the tests run on the production settings.
- The hooks return the project's own types: `loading | error | ready` for tasks and `checking | up | down` for health.
- Client defaults, set on purpose: `retry: false` and `networkMode: 'always'` for queries, `networkMode: 'always'` for mutations. The library's defaults would retry three times (the error would show about 7 seconds late) and would send nothing while the browser reports itself offline (the badge would stay "up").
- Left at the library's defaults: refetch on window focus, and polling that pauses while the tab is hidden.
- `useHealth` polls with `refetchInterval: 10_000`.
- Creating a task is a `useMutation` that writes the returned task into the cache with `setQueryData`: one POST and no second GET. Mutations are not retried.
- Two components that call the same hook share one request and one cached result.

## Tests

- Vitest reads `vite.config.ts`. There is no second transform setup.
- Testing Library does not unmount between tests under Vitest. `src/test-setup.ts` calls `afterEach(cleanup)`.
- Replace `fetch` with `vi.stubGlobal` and real `Response` objects. Use `fireEvent`.
- Every hook test gets a fresh client from `createQueryClient()` through a wrapper, so no cached data leaks between tests.
- With fake timers: advance with `await act(() => vi.advanceTimersByTimeAsync(ms))` and wait with `vi.waitFor`. Testing Library's `waitFor` hangs under fake timers. TanStack Query delivers a state change through `setTimeout(cb, 0)`, and Vitest's fake clock schedules a zero-delay timer created during an advance at now + 1 ms. An advance that ends exactly when a fetch settles stops 1 ms short of the notification: advance 1 ms past that moment (`1_001`, `10_001`).
- Tests are written first for the parts that hold logic: `api.ts`, the two hooks, the form's validation and the list's states. There is no coverage gate. Layout and CSS are checked by hand at desktop and mobile widths.

## Styles

CSS Modules, one per component, and one small global stylesheet for custom properties. Vite supplies the types through `vite/client`. The layout is one fluid column with a maximum width and wrapping rows, so it needs no breakpoints.
