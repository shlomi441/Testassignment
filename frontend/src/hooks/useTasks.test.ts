import { act, fireEvent, renderHook } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { advance, created, task } from "../test-fixtures.ts";
import { createWrapper } from "../test-wrapper.tsx";
import { useTasks } from "./useTasks.ts";

const networkFailure = new TypeError("Failed to fetch");

beforeEach(() => {
  vi.useFakeTimers();
});

function stubFetch() {
  const fetchMock = vi.fn<typeof fetch>(() => new Promise(() => {}));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderUseTasks() {
  return renderHook(useTasks, { wrapper: createWrapper() }).result;
}

const answerLater = (ms: number, response: Response) => () =>
  new Promise<Response>((resolve) => setTimeout(() => resolve(response), ms));

test('is "loading" before the first answer', () => {
  stubFetch();

  expect(renderUseTasks().current.state).toEqual({ status: "loading" });
});

test('is "ready" with the tasks after a 200', async () => {
  stubFetch().mockResolvedValueOnce(Response.json([task]));
  const result = renderUseTasks();

  await advance(0);

  expect(result.current.state).toEqual({ status: "ready", tasks: [task] });
});

test('is "error" with the reason after a failed load, at once and without a second request', async () => {
  const fetchMock = stubFetch().mockRejectedValueOnce(networkFailure);
  const result = renderUseTasks();

  await advance(0);

  expect(result.current.state).toEqual({
    status: "error",
    reason: "Failed to fetch",
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test('reload loads again and becomes "ready"', async () => {
  stubFetch()
    .mockRejectedValueOnce(networkFailure)
    .mockResolvedValueOnce(Response.json([task]));
  const result = renderUseTasks();
  await advance(0);

  await act(() => result.current.reload());
  await advance(0);

  expect(result.current.state).toEqual({ status: "ready", tasks: [task] });
});

test("add posts the title and puts the returned task into the list without a second GET", async () => {
  const fetchMock = stubFetch()
    .mockResolvedValueOnce(Response.json([task]))
    .mockResolvedValueOnce(Response.json(created, { status: 201 }));
  const result = renderUseTasks();
  await advance(0);

  await act(() => result.current.add("Ship it"));
  await advance(0);

  expect(result.current.state).toEqual({
    status: "ready",
    tasks: [task, created],
  });
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(fetchMock).toHaveBeenLastCalledWith(
    "/tasks",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ title: "Ship it" }),
    }),
  );
});

test("a failed add rejects with the API's message and leaves the list as it was", async () => {
  stubFetch()
    .mockResolvedValueOnce(Response.json([task]))
    .mockResolvedValueOnce(
      Response.json(
        {
          message: "title must not be empty",
          error: "Bad Request",
          statusCode: 400,
        },
        { status: 400 },
      ),
    );
  const result = renderUseTasks();
  await advance(0);

  await expect(act(() => result.current.add(" "))).rejects.toThrow(
    new Error("title must not be empty"),
  );
  await advance(0);

  expect(result.current.state).toEqual({ status: "ready", tasks: [task] });
});

test("an add while the load has failed keeps the error state", async () => {
  stubFetch()
    .mockRejectedValueOnce(networkFailure)
    .mockResolvedValueOnce(Response.json(created, { status: 201 }));
  const result = renderUseTasks();
  await advance(0);

  await act(() => result.current.add("Ship it"));
  await advance(0);

  expect(result.current.state).toEqual({
    status: "error",
    reason: "Failed to fetch",
  });
});

test("an add after a failed reload keeps the error state", async () => {
  stubFetch()
    .mockResolvedValueOnce(Response.json([task]))
    .mockRejectedValueOnce(networkFailure)
    .mockResolvedValueOnce(Response.json(created, { status: 201 }));
  const result = renderUseTasks();
  await advance(0);
  fireEvent(document, new Event("visibilitychange", { bubbles: true }));
  await advance(0);

  await act(() => result.current.add("Ship it"));
  await advance(0);

  expect(result.current.state).toEqual({
    status: "error",
    reason: "Failed to fetch",
  });
});

test("an add while the list is still loading puts the task into the list once the load answers, without a second GET", async () => {
  const fetchMock = stubFetch()
    .mockImplementationOnce(answerLater(1_000, Response.json([task])))
    .mockResolvedValueOnce(Response.json(created, { status: 201 }));
  const result = renderUseTasks();

  const added = result.current.add("Ship it");
  await advance(1_001);

  await expect(added).resolves.toEqual(created);
  expect(result.current.state).toEqual({
    status: "ready",
    tasks: [task, created],
  });
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

test("an add while a reload is in flight keeps the task when the reload answers", async () => {
  const fetchMock = stubFetch()
    .mockResolvedValueOnce(Response.json([task]))
    .mockImplementationOnce(answerLater(1_000, Response.json([task])))
    .mockResolvedValueOnce(Response.json(created, { status: 201 }));
  const result = renderUseTasks();
  await advance(0);
  fireEvent(document, new Event("visibilitychange", { bubbles: true }));
  await advance(0);

  const added = result.current.add("Ship it");
  await advance(1_001);

  await expect(added).resolves.toEqual(created);
  expect(result.current.state).toEqual({
    status: "ready",
    tasks: [task, created],
  });
  expect(fetchMock).toHaveBeenCalledTimes(3);
});

test("an add whose reload already answered with the task shows it once", async () => {
  stubFetch()
    .mockResolvedValueOnce(Response.json([task]))
    .mockImplementationOnce(answerLater(1_000, Response.json([task, created])))
    .mockImplementationOnce(
      answerLater(2_000, Response.json(created, { status: 201 })),
    );
  const result = renderUseTasks();
  await advance(0);
  fireEvent(document, new Event("visibilitychange", { bubbles: true }));
  await advance(0);

  const added = result.current.add("Ship it");
  await advance(2_001);

  await expect(added).resolves.toEqual(created);
  expect(result.current.state).toEqual({
    status: "ready",
    tasks: [task, created],
  });
});

test("loads again when the tab regains focus, and shows the error state when that load fails", async () => {
  const fetchMock = stubFetch()
    .mockResolvedValueOnce(Response.json([task]))
    .mockResolvedValueOnce(
      Response.json(
        { statusCode: 500, message: "Internal server error" },
        { status: 500 },
      ),
    );
  const result = renderUseTasks();
  await advance(0);

  fireEvent(document, new Event("visibilitychange", { bubbles: true }));
  await advance(0);

  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(result.current.state).toEqual({
    status: "error",
    reason: "Internal server error",
  });
});

test("add posts even when the browser reports itself offline", async () => {
  const fetchMock = stubFetch().mockResolvedValueOnce(Response.json([task]));
  const result = renderUseTasks();
  await advance(0);

  fireEvent.offline(window);
  void result.current.add("Ship it");
  await advance(0);

  expect(fetchMock).toHaveBeenLastCalledWith(
    "/tasks",
    expect.objectContaining({ method: "POST" }),
  );
});
