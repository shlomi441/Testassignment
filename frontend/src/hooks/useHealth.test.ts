import { act, fireEvent, renderHook } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { createWrapper } from "../test-wrapper.tsx";
import { useHealth } from "./useHealth.ts";

const answerOk = async () => Response.json({ status: "ok", uptime: 1 });

beforeEach(() => {
  vi.useFakeTimers();
});

function stubFetch(answer: () => Promise<Response>) {
  const fetchMock = vi.fn<typeof fetch>(answer);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderUseHealth() {
  return renderHook(useHealth, { wrapper: createWrapper() }).result;
}

const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

function setVisibility(state: DocumentVisibilityState) {
  vi.spyOn(document, "visibilityState", "get").mockReturnValue(state);
  fireEvent(document, new Event("visibilitychange", { bubbles: true }));
}

test('is "checking" before the first answer', () => {
  stubFetch(() => new Promise(() => {}));

  expect(renderUseHealth().current).toBe("checking");
});

test('is "up" after a 200 with status "ok"', async () => {
  stubFetch(answerOk);
  const result = renderUseHealth();

  await advance(0);

  expect(result.current).toBe("up");
});

test('is "down" after a 200 with another status', async () => {
  stubFetch(async () => Response.json({ status: "error", uptime: 1 }));
  const result = renderUseHealth();

  await advance(0);

  expect(result.current).toBe("down");
});

test('is "down" after a 500, at once and without a second request', async () => {
  const fetchMock = stubFetch(async () =>
    Response.json(
      { statusCode: 500, message: "Internal server error" },
      { status: 500 },
    ),
  );
  const result = renderUseHealth();

  await advance(0);

  expect(result.current).toBe("down");
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test('is "down" after a network failure', async () => {
  stubFetch(() => Promise.reject(new TypeError("Failed to fetch")));
  const result = renderUseHealth();

  await advance(0);

  expect(result.current).toBe("down");
});

test('is "down" when a poll fails after a good answer', async () => {
  const fetchMock = stubFetch(answerOk);
  const result = renderUseHealth();
  await advance(0);
  expect(result.current).toBe("up");

  fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
  // The poll fires mid-advance, and the fake clock moves a 0 ms timer set then 1 ms on.
  await advance(10_001);

  expect(result.current).toBe("down");
});

test("asks again every 10 seconds", async () => {
  const fetchMock = stubFetch(answerOk);
  renderUseHealth();

  await advance(9_999);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  await advance(1);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  await advance(10_000);
  expect(fetchMock).toHaveBeenCalledTimes(3);
});

test("does not ask while the tab is hidden, and asks once when it becomes visible", async () => {
  const fetchMock = stubFetch(answerOk);
  renderUseHealth();
  await advance(0);

  setVisibility("hidden");
  await advance(30_000);
  expect(fetchMock).toHaveBeenCalledTimes(1);

  setVisibility("visible");
  await advance(0);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

test("asks even when the browser reports itself offline", async () => {
  const fetchMock = stubFetch(answerOk);
  renderUseHealth();
  await advance(0);

  fireEvent.offline(window);
  await advance(10_000);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
