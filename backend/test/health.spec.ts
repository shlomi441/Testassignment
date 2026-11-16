import { beforeEach, expect, it, jest } from "@jest/globals";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";

let app: INestApplication;

beforeEach(async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  app = moduleRef.createNestApplication();
  await app.init();
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
