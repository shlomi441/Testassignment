---
name: chain
description: Run the unattended chain of a lane, one slice after another, each built by a fresh implementer and checked by the reviewer. Started by the author only.
argument-hint: <backend | frontend>
disable-model-invocation: true
---

# Unattended chain: $0

You coordinate the chain of the `$0` lane. You write no product code yourself. For each slice, in order, a fresh `implementer` subagent builds it, the `reviewer` subagent checks it, and you commit it on this lane's branch. The author is away while the chain runs and reviews it afterwards, commit by commit. Nothing reaches `main` here.

The chains, in their fixed order:

- `backend`: B2, B3, B4, B5, B6, B7
- `frontend`: F2, F3, F4, F5

## 0. Start in plan mode

This skill starts in plan mode. If plan mode is not active, stop and tell the author to press Shift+Tab until the status line shows plan mode, then to run `/chain $0` again. This matters twice: the approval below is the plan gate for the whole chain, and a subagent that starts while the session is in plan mode cannot write anything.

If the lane given is neither `backend` nor `frontend`, ask for it and stop.

## 1. Preconditions (read-only)

Find the notes folder with `git worktree list` (the first path is the main checkout; the notes folder is that path with `-notes` appended). Read `board.md` and `state/$0.md`. Stop with the reason if one of these fails:

- This session runs in the `$0` worktree, on the branch `worktree-$0`.
- The lane's first slice (B1 or F1) is merged, according to the board.
- `git status --short` is clean.
- `.claude/hooks/` holds the commit gate and `.claude/settings.json` has its `hooks` block. Without the gate nothing checks a commit, and the chain must not run.

Run `git log --oneline HEAD..main`. If it prints commits, `main` has moved since this lane was based on it. Say so in the plan: the lane is rebased as the first step after the approval.

If the state file shows a chain in flight, continue with the first slice that has no commit yet.

## 2. Plan gate for the chain

Read the slice file of every slice in the chain. Present, through plan mode's approval, for each slice in order: its purpose in one line, its tests by name, and its files. End with any point in a slice file that is unclear or that conflicts with another one, as a question.

Tell the author: approving this plan approves the specifications of all these slices at once, so read the slice files first; and approve with "Yes, auto-accept edits".

## 3. Wait for the goal

After the approval:

1. If `main` has moved: `git rebase main`, then the package's `verify`. A conflict or a failing `verify` is a stop-and-ask.
2. Write `state/$0.md`: phase `chain approved`, the list of slices, none done.
3. Print the goal line for this lane and end your turn. Do not start a slice. The chain starts when the author pastes the line.

```
/goal Each of the slices B2, B3, B4, B5, B6 and B7 has a status line in this conversation that shows its commit on the branch worktree-backend, verify at exit 0, and its record and explanation written; or a question for the author is waiting for an answer; or stop after 60 turns.
```

```
/goal Each of the slices F2, F3, F4 and F5 has a status line in this conversation that shows its commit on the branch worktree-frontend, verify at exit 0, and its record and explanation written; or a question for the author is waiting for an answer; or stop after 60 turns.
```

## 4. The loop, one slice at a time

Never run two slices at once, and never start a slice before the one before it is committed.

1. Write the state file: the slice and the phase `building`.
2. Start a fresh `implementer` subagent. Its task message: the slice ID, the notes folder, the package folder, and "build this slice". Do not pass a model. Wait for its answer and do nothing else meanwhile.
3. If it returns `QUESTION`: go to "A question". If it returns `RESULT` with `Verify: exit 0`, go on. Anything else counts as a failure: send it back once with what is missing; the second time is a stop-and-ask.
4. Check `git status --short` against the files in the result. Stage exactly those files by path.
5. Start the `reviewer` subagent with the slice ID, the notes folder and the package folder. Wait for its answer.
6. Blocking findings: send them to the same `implementer` (a message to it continues its work with its context intact), then stage and review again. If a finding is still blocking after it was sent back once, or after two rounds in all, that is a stop-and-ask.
7. Add the reviewer's findings to the record, under "Reviewer". Non-blocking findings are not acted on. They are for the author.
8. `git commit -m "<id>: <what the slice delivers>"`. The commit gate runs `verify` and refuses a failing commit. On a refusal, send the gate's output to the `implementer` once; the second refusal is a stop-and-ask.
9. Put the commit hash into the record. Update the state file. Print the status line:

```
STATUS <id>: commit <short hash> on worktree-$0 | verify exit 0 | record records/<id>.md | explanation explanations/<id>.md | non-blocking findings: <number>
```

## A question

A stop-and-ask stops the chain at that slice. Nothing after it starts.

Write the state file with phase `question open`. Ask the author through the question dialog, with the need, the options, the recommendation and the trade-offs as the `implementer` returned them. The dialog waits until the author answers; do not end your turn with a plain question while a goal is active, and never answer for the author.

When the answer fits inside the slice's specification, send it to the same `implementer` and continue. When it changes a specification or a decision, stop the chain: the lead seat records the change first.

## 5. When the chain is done

Write the state file with phase `at the done gate`, and print one table: slice, commit, tests, non-blocking findings, record, explanation. Then stop. Nothing is merged or pushed from here.

## 6. The done gate, slice by slice

When the author is back, go through the slices in order, for as long as the author wants:

- Show the commit with `git log -1 -p <hash>`, or name the files for the editor.
- Point to the failing-test output and the `verify` output in the record, the reviewer's findings, and the explanation.
- Answer questions. A change the author asks for becomes a small commit of its own on top, `<id> review: <what changed>`, with `verify` first. If the change touches a later slice, say so before you make it.

After each approval write `Approved up to: <commit hash>` into the state file. When the author is finished, tell them to run `/integrate $0` in the lead seat.

The state file has the format given at the end of `.claude/skills/slice/SKILL.md`, with the list of the chain's slices and their commits under "Done so far".
