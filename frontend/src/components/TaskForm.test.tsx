import { act, fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { TaskForm } from "./TaskForm.tsx";

const input = () => screen.getByLabelText<HTMLInputElement>("Title");
const button = () =>
  screen.getByRole<HTMLButtonElement>("button", { name: "Add" });
const alertText = () => screen.queryByRole("alert")?.textContent;

function renderForm(
  onAdd = vi
    .fn<(title: string) => Promise<unknown>>()
    .mockResolvedValue(undefined),
) {
  render(<TaskForm onAdd={onAdd} />);
  return onAdd;
}

function renderWithAddInFlight() {
  let succeed!: () => void;
  let fail!: () => void;
  const inFlight = new Promise((resolve, reject) => {
    succeed = () => resolve(undefined);
    fail = () => reject(new Error("Internal server error"));
  });
  const onAdd = renderForm(
    vi.fn<(title: string) => Promise<unknown>>().mockReturnValue(inFlight),
  );
  return { onAdd, succeed, fail };
}

async function submit(title: string) {
  fireEvent.change(input(), { target: { value: title } });
  await act(async () => {
    fireEvent.click(button());
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

  await submit("  Write tests  ");

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

test("submitting does not reload the page", () => {
  renderForm();
  fireEvent.change(input(), { target: { value: "Write tests" } });

  expect(fireEvent.submit(input().form!)).toBe(false);
});

test("the Add button is disabled while an add is in flight, so a second click does not call onAdd, and enabled again when the add succeeds", async () => {
  const { onAdd, succeed } = renderWithAddInFlight();
  await submit("Write tests");
  expect(button().disabled).toBe(true);

  fireEvent.click(button());
  expect(onAdd).toHaveBeenCalledOnce();

  await act(async () => succeed());
  expect(button().disabled).toBe(false);
});

test("the Add button is enabled again when the add fails", async () => {
  const { fail } = renderWithAddInFlight();
  await submit("Write tests");
  expect(button().disabled).toBe(true);

  await act(async () => fail());

  expect(button().disabled).toBe(false);
});

test("text typed while an add is in flight stays after the add succeeds", async () => {
  const { succeed } = renderWithAddInFlight();
  await submit("Write tests");
  fireEvent.change(input(), { target: { value: "Ship it" } });

  await act(async () => succeed());

  expect(input().value).toBe("Ship it");
});
