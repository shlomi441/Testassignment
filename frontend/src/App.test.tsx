import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { App } from "./App.tsx";
import { createWrapper } from "./test-wrapper.tsx";

const task = {
  id: "1",
  title: "Write tests",
  createdAt: "2026-11-16T10:00:00.000Z",
};
const created = {
  id: "2",
  title: "Ship it",
  createdAt: "2026-11-16T10:05:00.000Z",
};

beforeEach(() => {
  vi.useFakeTimers();
});

function stubApi() {
  const fetchMock = vi.fn<typeof fetch>(async (url, init) => {
    if (url === "/health") return Response.json({ status: "ok", uptime: 1 });
    if (init?.method === "POST") return Response.json(created, { status: 201 });
    return Response.json([task]);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const settle = () => act(() => vi.advanceTimersByTimeAsync(0));

const titles = () =>
  screen.queryAllByRole("listitem").map((item) => item.textContent);

async function renderApp() {
  render(<App />, { wrapper: createWrapper() });
  await settle();
}

test("a user adds a task and sees it in the list without a reload", async () => {
  const fetchMock = stubApi();
  await renderApp();
  expect(titles()).toEqual(["Write tests"]);

  fireEvent.change(screen.getByLabelText("Title"), {
    target: { value: "Ship it" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add" }));
  await settle();

  expect(titles()).toEqual(["Ship it", "Write tests"]);
  const tasksRequests = fetchMock.mock.calls
    .filter(([url]) => url === "/tasks")
    .map(([, init]) => init?.method ?? "GET");
  expect(tasksRequests).toEqual(["GET", "POST"]);
});

test("the page shows the badge, the form and the list", async () => {
  stubApi();
  await renderApp();

  expect(screen.queryByRole("status")?.textContent).toBe("API: up");
  expect(screen.queryByLabelText("Title")).not.toBeNull();
  expect(titles()).toEqual(["Write tests"]);
});
