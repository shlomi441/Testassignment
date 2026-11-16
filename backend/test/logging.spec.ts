import { beforeEach, expect, it, jest } from "@jest/globals";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "./create-test-app";

const log = jest.fn();
let app: INestApplication;

beforeEach(async () => {
  app = await createTestApp();
  app.useLogger({ log, error: jest.fn(), warn: jest.fn() });
});

it("a served request produces exactly one line", async () => {
  await request(app.getHttpServer()).get("/health");

  expect(log).toHaveBeenCalledTimes(1);
  expect(log).toHaveBeenCalledWith(
    {
      method: "GET",
      path: "/health",
      status: 200,
      durationMs: expect.any(Number),
      aborted: false,
    },
    "HTTP",
  );
});

it("malformed JSON still produces its line, with status 400", async () => {
  await request(app.getHttpServer())
    .post("/tasks")
    .set("Content-Type", "application/json")
    .send('{"title":');

  expect(log).toHaveBeenCalledWith(
    expect.objectContaining({ method: "POST", path: "/tasks", status: 400 }),
    "HTTP",
  );
});

it("an unknown path still produces its line, with status 404", async () => {
  await request(app.getHttpServer()).get("/nope");

  expect(log).toHaveBeenCalledWith(
    expect.objectContaining({ method: "GET", path: "/nope", status: 404 }),
    "HTTP",
  );
});
