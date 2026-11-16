import { act, fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { TaskForm } from "./TaskForm.tsx";

const input = () => screen.getByLabelText<HTMLInputElement>("Title");
const alertText = () => screen.queryByRole("alert")?.textContent;

function renderForm(
  onAdd = vi
    .fn<(title: string) => Promise<unknown>>()
    .mockResolvedValue(undefined),
) {
  render(<TaskForm onAdd={onAdd} />);
  return onAdd;
}

async function submit(title: string) {
  fireEvent.change(input(), { target: { value: title } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
  });
}

test("submitting a title calls onAdd with the trimmed title", async () => {
  const onAdd = renderForm();

  await submit("  Write tests  ");

  expect(onAdd).toHaveBeenCalledExactlyOnceWith("Write tests");
});

test('an empty title shows "Title is required" and does not call onAdd', async () => {
  const onAdd = renderForm();

  await submit("");

  expect(alertText()).toBe("Title is required");
  expect(onAdd).not.toHaveBeenCalled();
});

test('a title of whitespace only shows "Title is required" and does not call onAdd', async () => {
  const onAdd = renderForm();

  await submit("   ");

  expect(alertText()).toBe("Title is required");
  expect(onAdd).not.toHaveBeenCalled();
});

test("the input takes 200 characters at most", () => {
  renderForm();

  expect(input().maxLength).toBe(200);
});

test("after a successful add the input is empty", async () => {
  renderForm();

  await submit("Write tests");

  expect(input().value).toBe("");
});

test("a failed add shows the API's message in an alert, at once, and keeps the text", async () => {
  renderForm(
    vi
      .fn<(title: string) => Promise<unknown>>()
      .mockRejectedValue(new Error("Internal server error")),
  );

  await submit("Write tests");

  expect(alertText()).toBe("Could not add the task: Internal server error");
  expect(input().value).toBe("Write tests");
});

test("a valid submit removes an earlier message", async () => {
  renderForm();
  await submit("   ");
  expect(alertText()).toBe("Title is required");

  await submit("Write tests");

  expect(alertText()).toBeUndefined();
});
