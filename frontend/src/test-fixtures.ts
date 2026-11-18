import { act } from "@testing-library/react";
import { vi } from "vitest";

export const task = {
  id: "1",
  title: "Write tests",
  createdAt: "2026-11-16T10:00:00.000Z",
};

export const created = {
  id: "2",
  title: "Ship it",
  createdAt: "2026-11-16T10:05:00.000Z",
};

export const advance = (ms: number) =>
  act(() => vi.advanceTimersByTimeAsync(ms));
