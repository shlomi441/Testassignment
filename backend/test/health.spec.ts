import { beforeEach, expect, it, jest } from "@jest/globals";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "./create-test-app";

let app: INestApplication;

beforeEach(async () => {
  app = await createTestApp();
});

it('GET /health answers 200 with status "ok" and a numeric uptime', async () => {
  const response = await request(app.getHttpServer()).get("/health");

  expect(response.status).toBe(200);
  expect(response.body).toEqual({ status: "ok", uptime: expect.any(Number) });
});

it("uptime is the process uptime rounded down to whole seconds", async () => {
  jest.spyOn(process, "uptime").mockReturnValue(12.9);

  const response = await request(app.getHttpServer()).get("/health");

  expect(response.body.uptime).toBe(12);
});
