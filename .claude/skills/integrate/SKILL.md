---
name: integrate
description: Lead seat only. Bring a lane's approved commits to main by fast-forward, push, watch the pipeline and update the notes. Started by the author only.
argument-hint: <backend | frontend | lead>
disable-model-invocation: true
---

# Integrate: $0

You are the lead seat. You bring approved work to `main`, push it, watch the pipeline and keep the notes current. You write no backend or frontend code here.

With `backend` or `frontend`, you start at "Fast-forward". With `lead`, the work is already committed on `main` by a lead-seat slice, and you start at "Push". If the argument is none of the three, ask for it and stop.

## Before anything

1. `git worktree list`: this session has to run in the main checkout, the first path. The notes folder is that path with `-notes` appended.
2. `git status --short --branch`: the branch is `main` and nothing is uncommitted.
3. Read `board.md` and `state/lead.md`, and for a lane `state/$0.md`. If `state/lead.md` shows an integration that was interrupted, continue it from its next step.

If plan mode is active, present the plan below through plan mode's approval and ask for "Yes, auto-accept edits". If it is not, print the same plan and go on; the push still asks.

The plan: the commits that will reach `main` (`git log --oneline main..<commit>`), the lead's part of each of their slices where the slice file has one, whether this integration closes a stage, and what will be pushed.

## Fast-forward (lanes)

Write `state/lead.md` first: what is being integrated, and that the merge is the next step. Rewrite it after the merge and after the push, so that an interrupted integration can be continued.

1. The lane's state file gives `Approved up to: <commit>`. If it gives none, ask the author which commit is approved. Never take the tip of the branch on your own.
2. `git log --oneline <commit>..main` has to print nothing. If it prints commits, `main` has moved since the lane was based on it: stop and tell the author to have the lane session run `git rebase main` and `verify` and write the new `Approved up to:` hash (a rebase changes the hashes), and to come back afterwards.
3. `git merge --ff-only <commit>`. It refuses anything that is not a fast-forward. A refusal is a result: report it and stop.

## The lead's part

A lane changes only its own package folder. What a slice needs outside it (the root scripts, the pipeline) is yours, and the slice file lists it under "The lead's part at integration". For each slice that the fast-forward just brought to `main`, read that section. Where there is none, go on to the next step.

1. Read `.claude/rules/infra.md` when the part touches the pipeline.
2. See the section's check fail first. Then write the least that makes it pass, run the root `npm run verify`, and print its output.
3. Stage the files by path, and delegate the review to the `reviewer` with the slice ID and the words "the lead's part". Fix what is blocking.
4. Write `records/<id>-wiring.md` and `explanations/<id>-wiring.md` in the notes folder, with the headings of every record and every explanation. The explanation covers every line of a new file.
5. Show the author the staged diff, the `verify` output and the reviewer's findings, and wait for the approval.
6. Commit with the message the section gives.

## Stage close

When this integration brings the last open slice of a stage to `main`, it is that stage's close: V1 for the backend, V2 for the frontend (the board tells you). Read the close's file, `spec/slices/V1.md` or `V2.md`, and do what it adds. Before you push, run the bundled code review. The first time, review the commits that are not pushed yet: `/code-review` with no target reviews the commits ahead of the upstream branch. A re-run after a fix reviews less (below). If you cannot start the review yourself, give the author the command to type. Then write `Reviewed up to: <hash of HEAD>` in `state/lead.md`, and keep that line whenever you rewrite the file.

Wait for the findings and show all of them to the author. Change nothing on a finding's word. What the author wants fixed goes back to the lane as a small commit, or is fixed here when it is a lead-seat file, and then this skill runs again and comes back to this section. When a fix changes behaviour that `.claude/rules/<package>.md` describes, update that file here in the same integration, before the re-review, as a lead's part: its red is a search that does not find the new fact, and its commit message is `<stage> wiring: <what the file now says>`.

When the skill runs again after a fix, review only what the fix added. The commits before `Reviewed up to:` were reviewed, and the author has ruled on their findings. If the line is missing, ask the author which commit was reviewed last.
- A fix that changes only Markdown files under `.claude/` gets the `reviewer` and no `/code-review`.
- Any other fix gets `/code-review <Reviewed up to>..HEAD`, which reviews only the commits after that hash.
- Afterwards, move `Reviewed up to:` to the new `HEAD`.

## Push

1. `git push`. It asks the author every time, and that prompt is the approval. Once the deploy job exists, a push to `main` is a deployment: say so in the line before the push.
2. If no workflow file exists yet, there is no run to watch: go to "Notes".
3. Find the run of the pushed commit: `git log -1 --format=%H`, then `gh run list --branch main --limit 5 --json databaseId,headSha,status`. Take the entry whose `headSha` is that commit; if it is not listed yet, ask again after a moment.
4. `gh run watch <id> --exit-status`. With the read-only token an "ANNOTATIONS ... 403" note at the end is expected and harmless.
5. A red run: `gh run view <id> --log-failed`, report the failing step with its output, and stop. The fix is a new small commit after the author agrees, never a rewrite of what was pushed.

## Notes

You are the only writer of these files. Do this after every push, and also when the push was refused or the run is red, with the true state.

1. `board.md`: set each slice that reached `main` to `merged <short hash>`, and a slice that finished without a commit to `done`; set to `ready` every slice whose needs are now all `merged` or `done`; update the open questions. Keep the board to one screen.
2. `EXPLANATIONS.md`: part 2 has to hold the explanation of every finished slice. Keep what is there and append the missing ones from `explanations/`, oldest first by the date in each slice's record. Parts 1 and 3 stay as they are. If the file does not exist yet, create it with the three headings `# Part 1: Decisions`, `# Part 2: Slices` and `# Part 3: Glossary`.
3. `README_NOTES.md`: copy the proposed notes from the records of the finished slices into the matching sections, dated, in the author's first person, each marked as drafted by the AI and not yet checked by the author.
4. `state/lead.md`: what was integrated, the pipeline result, the next step.
5. Commit the notes folder, which is its own local repository: `git -C <notes folder> add -A`, then `git -C <notes folder> commit -m "<what was integrated>"`. It has no remote and is never pushed.

## Report

Tell the author: what is on `main` now, the pipeline result with the run's ID, which slices are ready next and in which seat, and what is waiting for the author.
