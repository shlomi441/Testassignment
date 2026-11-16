import { afterAll, beforeEach, expect, it, jest } from "@jest/globals";
import type { INestApplication } from "@nestjs/common";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import request from "supertest";
import { createTestApp } from "./create-test-app";

const publicDir = join(__dirname, "..", "public");
let app: INestApplication;

beforeEach(async () => {
  await rm(publicDir, { recursive: true, force: true });
  app = await createTestApp();
});

afterAll(() => rm(publicDir, { recursive: true, force: true }));

it("no response carries the X-Powered-By header", async () => {
  const response = await request(app.getHttpServer()).get("/health");

  expect(response.headers["x-powered-by"]).toBeUndefined();
});

it("a file in the static folder is served, and the request is logged", async () => {
  await mkdir(publicDir);
  await writeFile(join(publicDir, "index.html"), "<h1>Tasks</h1>");
  const log = jest.fn();
  app.useLogger({ log, error: jest.fn(), warn: jest.fn() });

  const response = await request(app.getHttpServer()).get("/");

  expect(response.text).toBe("<h1>Tasks</h1>");
  expect(log).toHaveBeenCalledWith(
    expect.objectContaining({ method: "GET", path: "/", status: 200 }),
    "HTTP",
  );
});

it("the API still answers when the static folder is missing", async () => {
  const response = await request(app.getHttpServer()).get("/health");

  expect(response.status).toBe(200);
});
