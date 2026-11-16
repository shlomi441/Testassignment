import { beforeEach, expect, it } from "@jest/globals";
import { InMemoryTaskRepository } from "./in-memory-task.repository";
import type { Task } from "./task.repository";

const numberedTask = (n: number): Task => ({
  id: String(n),
  title: `Task ${n}`,
  createdAt: "2026-11-10T21:49:36.151Z",
});

let repository: InMemoryTaskRepository;

beforeEach(() => {
  repository = new InMemoryTaskRepository();
});

it("create and findAll return Promises", async () => {
  const created = repository.create(numberedTask(1));
  const listed = repository.findAll();

  expect(created).toBeInstanceOf(Promise);
  expect(listed).toBeInstanceOf(Promise);
  await Promise.all([created, listed]);
});

it("findAll resolves to an empty array when nothing is stored", async () => {
  expect(await repository.findAll()).toEqual([]);
});

it("findAll returns the tasks in creation order, oldest first", async () => {
  await repository.create(numberedTask(1));
  await repository.create(numberedTask(2));

  expect(await repository.findAll()).toEqual([
    numberedTask(1),
    numberedTask(2),
  ]);
});

it("a stored task comes back with exactly the fields it was given", async () => {
  const given = numberedTask(1);
  await repository.create(given);

  expect(await repository.findAll()).toStrictEqual([given]);
});

it("changing a task after create does not change the stored one", async () => {
  const task = numberedTask(1);
  await repository.create(task);

  task.title = "Changed";

  expect(await repository.findAll()).toEqual([numberedTask(1)]);
});

it("changing a returned task does not change the stored one", async () => {
  await repository.create(numberedTask(1));
  const returned = await repository.findAll();
  expect(returned).toEqual([numberedTask(1)]);

  returned[0].title = "Changed";

  expect(await repository.findAll()).toEqual([numberedTask(1)]);
});

it("keeps the newest 100 tasks: the 101st drops the oldest", async () => {
  for (let n = 1; n <= 101; n++) {
    await repository.create(numberedTask(n));
  }

  expect(await repository.findAll()).toEqual(
    Array.from({ length: 100 }, (_, index) => numberedTask(index + 2)),
  );
});
