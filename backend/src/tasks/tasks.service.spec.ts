import { beforeEach, expect, it, jest } from "@jest/globals";
import { TaskRepository } from "./task.repository";
import { TasksService } from "./tasks.service";

const create = jest.fn<TaskRepository["create"]>();
const findAll = jest.fn<TaskRepository["findAll"]>();
const service = new TasksService({ create, findAll });

jest.useFakeTimers({ now: new Date("2026-11-10T21:49:36.151Z") });

beforeEach(() => {
  jest.clearAllMocks();
});

it("create builds a task with a UUID, the title and the current time", async () => {
  expect(await service.create("Buy milk")).toStrictEqual({
    id: expect.stringMatching(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    ),
    title: "Buy milk",
    createdAt: "2026-11-10T21:49:36.151Z",
  });
});

it("create hands the task to the repository and returns it", async () => {
  const task = await service.create("Buy milk");

  expect(create).toHaveBeenCalledTimes(1);
  expect(create).toHaveBeenCalledWith(task);
});

it("two tasks get different ids", async () => {
  const first = await service.create("Buy milk");
  const second = await service.create("Buy milk");

  expect(second).toEqual({ ...first, id: expect.any(String) });
  expect(second.id).not.toBe(first.id);
});

it("findAll returns what the repository holds", async () => {
  const stored = [
    { id: "1", title: "Buy milk", createdAt: "2026-11-10T21:49:36.151Z" },
  ];
  findAll.mockResolvedValue(stored);

  expect(await service.findAll()).toEqual(stored);
});
