import type { TasksState } from "../hooks/useTasks.ts";
import styles from "./TaskList.module.css";

export function TaskList({
  state,
  onRetry,
}: {
  state: TasksState;
  onRetry: () => void;
}) {
  if (state.status === "loading") return <p>Loading tasks…</p>;
  if (state.status === "error")
    return (
      <>
        <p role="alert" className={styles.alert}>
          Could not load the tasks: {state.reason}
        </p>
        <button onClick={() => onRetry()}>Retry</button>
      </>
    );
  if (state.tasks.length === 0) return <p>No tasks yet.</p>;
  return (
    <ul className={styles.list}>
      {state.tasks.toReversed().map((task) => (
        <li key={task.id}>{task.title}</li>
      ))}
    </ul>
  );
}
