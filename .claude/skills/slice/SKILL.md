---
name: slice
description: Build one attended slice, with a plan gate before any change and a done gate before the commit. Started by the author only.
argument-hint: <slice-id>
disable-model-invocation: true
---

# Attended slice $0

You build slice `$0` together with the author. There are two gates, and you stop at each until the author says yes: the plan gate before any file changes, and the done gate before the commit. Between them nothing waits for the author.

## 0. Start in plan mode

This skill starts in plan mode. If plan mode is not active, stop and tell the author to press Shift+Tab until the status line shows plan mode, then to run `/slice $0` again. If no slice ID was given, ask for it and stop.

## 1. Orient (read-only)

1. Find the notes folder: run `git worktree list`. The first path is the main checkout; the notes folder is that path with `-notes` appended. The same output tells you your seat: `lead` in the main checkout, `backend` or `frontend` in a worktree.
2. Read `board.md`, `spec/slices/$0.md` and `state/<seat>.md` if it exists.
3. Check, and stop with the reason if one fails:
   - The slice file names this seat as the place where `$0` runs.
   - Every slice that `$0` needs is merged, according to the board.
   - `git status --short` shows nothing that the slice file does not expect, or the state file says that `$0` is in flight. If it is in flight, continue from the phase and the next step the state file gives.
4. Read the rule file of the slice's area, and `${CLAUDE_SKILL_DIR}/procedure.md`.

## 2. Plan gate

Present the plan through plan mode's approval:

- The behaviours to prove, as test names.
- The files to create or change.
- The commands to run.
- The author's own steps in this slice, if the slice file has any, with their exact commands.
- Anything in the slice file that is unclear or that conflicts with what you see. Put it as a question, do not resolve it yourself.

Ask the author to approve with "Yes, auto-accept edits". Change the plan until it is approved.

## 3. Build

1. Write `state/<seat>.md` with the approved plan (the format is at the end of this file). Rewrite it at every phase change.
2. Install as the slice file says. A package that already has a lockfile and no `node_modules` gets `npm ci`.
3. Follow `procedure.md`, steps 1 to 4: red, green, clean check, format and verify. You do the work yourself; an attended slice does not use the `implementer`.

## 4. Review

A slice that changes no file in the repository has nothing to review: its slice file says so, and this step is skipped.

1. Stage the slice's files by path with `git add`.
2. Run the `reviewer` subagent. Give it the slice ID, the notes folder and the package folder, and wait for its answer. Do nothing else meanwhile.
3. Fix every blocking finding, run `verify` again and stage again. If the reviewer has to be asked twice about the same finding, that is a stop-and-ask.
4. Do not act on non-blocking findings. They go to the author.

## 5. Record and explanation

Follow `procedure.md`, steps 5 and 6. Put the reviewer's findings into the record.

## 6. Done gate

Print the done summary and stop. Do not commit.

- What the slice delivers, in two or three sentences.
- The files, and how to read the change: `git diff --cached`, or the files in the editor.
- The failing-test output from the record.
- The output of the last `verify`, not summarised.
- The reviewer's findings: what was blocking and how it was fixed, and the non-blocking ones as reported.
- Files outside the plan, with the reason.
- The path of the explanation, and the proposed README notes.

Then wait. Answer the author's questions and make the changes the author asks for, with `verify` again after each change. If the author edits a file, read it again before you go on.

## 7. After the approval

A slice that changes nothing in the repository (its slice file says so) has nothing to commit or push: read `.claude/skills/integrate/SKILL.md`, carry out "Notes" and "Report", and go to step 5.

1. Stage by path, then `git commit -m "$0: <what the slice delivers>"`. The commit gate runs `verify` again and refuses a failing commit. A refusal is a result: fix the cause, never go around the gate.
2. Put the commit hash into the record.
3. In a lane: run `git log --oneline HEAD..main`. If it prints commits, `main` has moved: run `git rebase main`, then `verify` again. A conflict is a stop-and-ask. Then write the state file with phase `ready to integrate` and `Approved up to: <commit hash>`, and tell the author to run `/integrate <lane>` in the lead seat.
4. In the lead seat: read `.claude/skills/integrate/SKILL.md` and carry out its steps from "Push" to the end. Where the slice file puts a step between the commit and the push (S2's harness check, an author's step), that step comes first.
5. Tell the author that this session is finished. The next slice starts in a new session or after `/clear`.

## The state file

`state/<seat>.md` in the notes folder, where the seat is `lead`, `backend` or `frontend`. Keep it under 40 lines: a hook prints it into every new session of this seat.

```markdown
# State: <seat>

Slice: <id>
Phase: <plan approved | red | green | verify | review | at the done gate | committed | ready to integrate | question open; a chain also uses: chain approved, building>
Updated: <yyyy-mm-dd hh:mm>
Approved up to: <commit hash; lanes only, after the done gate>

## Approved plan
<test names, files, commands>

## Done so far
<one line per finished step>

## Next step
<the one thing to do next>
```
