# Building one slice

The one description of how a slice is built. `/slice` follows it in an attended session, and the `implementer` subagent follows it inside a chain. The gates around it differ and are described there, not here.

## Inputs

- The slice ID, for example `B3`.
- The notes folder. Run `git worktree list`: the first path is the main checkout, and the notes folder is that path with `-notes` appended.
- Read, in this order: `spec/slices/<id>.md` in the notes folder; the rule file of the slice's area (`.claude/rules/backend.md`, `frontend.md` or `infra.md`); then the parts of `spec/design.md` and `spec/requirements.md` that the slice file names.

The slice file is the plan: the behaviours to prove as test names, the files, the commands. Build what it says and nothing else. A file it does not list may be touched when the work needs it; name every such file in the record.

Some slices have a check that is not a unit test: a build, a `terraform validate`, a container that has to start, a pipeline run. Their slice file says what counts as red and as green. The order stays the same: see the check fail first, then make it pass.

## 1. Red

Write the tests of this slice and no production code. Use the test names from the slice file.

Run them with the package's `test` script. Each test has to fail, and for the reason its name gives: an assertion that reports the missing behaviour. A test that fails because a module or an export does not exist proves nothing yet. Add the smallest declaration that lets it load (an empty function, a class without a body), run again, and see it fail on its assertion.

Create the record now, `records/<id>.md` in the notes folder, and paste the command and its failing output under "Failing tests".

## 2. Green

Write the least code that makes the failing tests pass. Write it short and clean the first time: the code rules in `CLAUDE.md` apply while you write, not afterwards.

## 3. Clean check

Look only at the code this slice added or changed. For anything that may be unnecessary (a parameter, a branch, a fallback, an option, a file), remove that one piece and run the tests. If they still pass and the specification does not ask for it, it stays out. Otherwise put it back.

One piece at a time. Nothing in bulk, and nothing outside this slice.

## 4. Format and verify

Run the package's `format` script, then its `verify` script. Print the output of `verify` as it is; do not summarise it. It has to end with exit code 0.

Lint warnings do not fail `verify`. List them in the record; they are fixed in slice R2.

## 5. Record

Complete `records/<id>.md`:

```markdown
# Record: <id> <title>

Seat: <lead | backend | frontend>. Date: <yyyy-mm-dd>. Commit: <filled in after the commit>.

## Failing tests
<the command, and its output from before the production code existed>

## Verify
<the command, the last lines of its output, the exit code>

## Reviewer
<filled in after the review: blocking findings and what was done about each; non-blocking findings as reported>

## Files
<every file created or changed; mark the ones the slice file did not list, with the reason>

## Lint warnings
<each warning with file and rule, or "none">

## Proposed README notes
<entries in the author's first person, each with a date and the trigger it answers, or "none">
```

## 6. Explanation

Write `explanations/<id>.md` in the notes folder. It is written for the author, who knows Java and Spring Boot well and is new to this stack, and who has to explain every line in an interview.

```markdown
# <id> <title>

## What was built
<every file, and inside it every construct that is not obvious: what it does, line by line where needed>

## Why this way
<the decision behind each choice, with its ID from spec/design.md>

## What was rejected
<the alternatives, and the reason each lost>

## The Spring anchor
<the closest Java or Spring analogy, and where it breaks>

## What went wrong on the way
<errors hit, wrong turns, and what fixed them; "nothing" when that is true>

## Three questions an interviewer could ask
<each with a short answer>
```

## Stop and ask

At any step, when one of the stop-and-ask triggers in `CLAUDE.md` fires: stop, change nothing further, and put the question. In an attended session, ask the author through the question dialog. In a chain, the `implementer` returns the question to the lane session, which asks the author.

The question states what is needed, the options, a recommendation, the trade-offs and side effects, and a Java/Spring analogy where one helps.
