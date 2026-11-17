import { expect, test, vi } from "vitest";
import { createTask, getHealth, getTasks } from "./api.ts";

const task = {
  id: "1",
  title: "Write tests",
  createdAt: "2026-11-16T10:00:00.000Z",
};

function stubFetch(response: Response) {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

test("getHealth requests /health and returns the body", async () => {
  const fetchMock = stubFetch(Response.json({ status: "ok", uptime: 12 }));

  expect(await getHealth()).toEqual({ status: "ok", uptime: 12 });
  expect(fetchMock).toHaveBeenCalledWith("/health", {
    signal: expect.any(AbortSignal),
  });
});

test("getTasks requests /tasks and returns the array", async () => {
  const fetchMock = stubFetch(Response.json([task]));

  expect(await getTasks()).toEqual([task]);
  expect(fetchMock).toHaveBeenCalledWith("/tasks", undefined);
});

test("createTask posts the title as JSON to /tasks and returns the created task", async () => {
  const fetchMock = stubFetch(Response.json(task, { status: 201 }));

  expect(await createTask("Write tests")).toEqual(task);
  expect(fetchMock).toHaveBeenCalledWith("/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "Write tests" }),
  });
});

test("a response that is not 2xx throws an Error with the API's message", async () => {
  stubFetch(
    Response.json(
      {
        message: "title must not be empty",
        error: "Bad Request",
        statusCode: 400,
      },
      { status: 400 },
    ),
  );

  await expect(createTask(" ")).rejects.toThrow(
    new Error("title must not be empty"),
  );
});

test("a network failure is passed on as an error", async () => {
  const failure = new TypeError("Failed to fetch");
  vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockRejectedValue(failure));

  await expect(getTasks()).rejects.toBe(failure);
});
