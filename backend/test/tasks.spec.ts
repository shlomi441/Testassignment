import { beforeEach, expect, it, jest } from "@jest/globals";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { TaskRepository } from "../src/tasks/task.repository";
import { createTestApp } from "./create-test-app";

const create = jest.fn<TaskRepository["create"]>();
const findAll = jest.fn<TaskRepository["findAll"]>();
let app: INestApplication;

beforeEach(async () => {
  jest.clearAllMocks();
  app = await createTestApp({ create, findAll });
});

it("GET /tasks answers 200 with the tasks the repository holds", async () => {
  const stored = [
    { id: "1", title: "Buy milk", createdAt: "2026-11-10T21:49:36.151Z" },
    { id: "2", title: "Walk the dog", createdAt: "2026-11-10T21:50:02.004Z" },
  ];
  findAll.mockResolvedValue(stored);

  const response = await request(app.getHttpServer()).get("/tasks");

  expect(response.status).toBe(200);
  expect(response.body).toEqual(stored);
});

it("GET /tasks answers 200 with an empty array when there are none", async () => {
  findAll.mockResolvedValue([]);

  const response = await request(app.getHttpServer()).get("/tasks");

  expect(response.status).toBe(200);
  expect(response.body).toEqual([]);
});

it("POST /tasks with a valid title answers 201 with the created task and stores it", async () => {
  const response = await request(app.getHttpServer())
    .post("/tasks")
    .send({ title: "Buy milk" });

  expect(response.status).toBe(201);
  expect(response.body).toEqual({
    id: expect.any(String),
    title: "Buy milk",
    createdAt: expect.any(String),
  });
  expect(create).toHaveBeenCalledWith(response.body);
});

it("POST /tasks without a title answers 400 with the message and stores nothing", async () => {
  const response = await request(app.getHttpServer()).post("/tasks").send({});

  expect(response.status).toBe(400);
  expect(response.body).toEqual({
    statusCode: 400,
    message: "title is required and must be a string",
    error: "Bad Request",
  });
  expect(create).not.toHaveBeenCalled();
});

it("POST /tasks with an empty title answers 400 with the message", async () => {
  const response = await request(app.getHttpServer())
    .post("/tasks")
    .send({ title: "" });

  expect(response.status).toBe(400);
  expect(response.body).toEqual({
    statusCode: 400,
    message: "title must not be empty",
    error: "Bad Request",
  });
});

it("POST /tasks with malformed JSON answers 400", async () => {
  const response = await request(app.getHttpServer())
    .post("/tasks")
    .set("Content-Type", "application/json")
    .send('{"title":');

  expect(response.status).toBe(400);
});

it("POST /tasks with a body that is not JSON answers 400", async () => {
  const response = await request(app.getHttpServer())
    .post("/tasks")
    .set("Content-Type", "text/plain")
    .send("Buy milk");

  expect(response.status).toBe(400);
});

it("an unknown path answers 404", async () => {
  const response = await request(app.getHttpServer()).get("/nope");

  expect(response.status).toBe(404);
});

it("a wrong method on a known path answers 404", async () => {
  const response = await request(app.getHttpServer()).delete("/tasks");

  expect(response.status).toBe(404);
});

it("an unexpected error answers 500 without its cause, and the cause is logged", async () => {
  const cause = new Error("connection lost");
  findAll.mockRejectedValue(cause);
  const logger = { log: jest.fn(), error: jest.fn(), warn: jest.fn() };
  app.useLogger(logger);

  const response = await request(app.getHttpServer()).get("/tasks");

  expect(response.status).toBe(500);
  expect(response.body).toEqual({
    statusCode: 500,
    message: "Internal server error",
  });
  expect(logger.error).toHaveBeenCalledWith(
    cause,
    undefined,
    "ExceptionsHandler",
  );
});
