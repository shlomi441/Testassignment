import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { TaskList } from "./TaskList.tsx";

test("shows a loading text while the tasks load", () => {
  const { container } = render(
    <TaskList state={{ status: "loading" }} onRetry={() => {}} />,
  );

  expect(container.textContent).toBe("Loading tasks…");
});

test("says that there are no tasks yet when the list is empty", () => {
  const { container } = render(
    <TaskList state={{ status: "ready", tasks: [] }} onRetry={() => {}} />,
  );

  expect(container.textContent).toBe("No tasks yet.");
});

test("shows an alert with the reason and a Retry button, and Retry calls onRetry", () => {
  const onRetry = vi.fn();
  render(
    <TaskList
      state={{ status: "error", reason: "Failed to fetch" }}
      onRetry={onRetry}
    />,
  );

  expect(screen.queryByRole("alert")?.textContent).toBe(
    "Could not load the tasks: Failed to fetch",
  );
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(onRetry).toHaveBeenCalledExactlyOnceWith();
});

test("shows every title, the newest first", () => {
  const tasks = [
    { id: "1", title: "First", createdAt: "2026-11-16T10:00:00.000Z" },
    { id: "2", title: "Second", createdAt: "2026-11-16T10:01:00.000Z" },
    { id: "3", title: "Third", createdAt: "2026-11-16T10:02:00.000Z" },
  ];
  render(<TaskList state={{ status: "ready", tasks }} onRetry={() => {}} />);

  expect(
    screen.queryAllByRole("listitem").map((item) => item.textContent),
  ).toEqual(["Third", "Second", "First"]);
  expect(tasks.map((task) => task.title)).toEqual(["First", "Second", "Third"]);
});
