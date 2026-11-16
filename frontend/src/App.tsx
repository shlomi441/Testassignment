import styles from "./App.module.css";
import { HealthBadge } from "./components/HealthBadge.tsx";
import { TaskForm } from "./components/TaskForm.tsx";
import { TaskList } from "./components/TaskList.tsx";
import { useHealth } from "./hooks/useHealth.ts";
import { useTasks } from "./hooks/useTasks.ts";

export function App() {
  const health = useHealth();
  const { state, reload, add } = useTasks();
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1>Tasks</h1>
        <HealthBadge state={health} />
      </header>
      <TaskForm onAdd={add} />
      <TaskList state={state} onRetry={reload} />
    </main>
  );
}
