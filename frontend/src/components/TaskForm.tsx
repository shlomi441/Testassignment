import { useState, type SubmitEvent } from "react";
import styles from "./TaskForm.module.css";

export function TaskForm({
  onAdd,
}: {
  onAdd: (title: string) => Promise<unknown>;
}) {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [adding, setAdding] = useState(false);

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) {
      setMessage("Title is required");
      return;
    }
    setMessage("");
    setAdding(true);
    try {
      await onAdd(trimmed);
      setTitle("");
    } catch (error) {
      setMessage(`Could not add the task: ${(error as Error).message}`);
    } finally {
      setAdding(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <label className={styles.field}>
        Title
        <input
          value={title}
          maxLength={200}
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>
      <button disabled={adding}>Add</button>
      {message && (
        <p role="alert" className={styles.alert}>
          {message}
        </p>
      )}
    </form>
  );
}
