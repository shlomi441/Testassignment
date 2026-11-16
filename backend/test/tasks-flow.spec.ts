import { expect, it } from "@jest/globals";
import request from "supertest";
import { createTestApp } from "./create-test-app";

it("two POSTs and a GET return both tasks, oldest first", async () => {
  const app = await createTestApp();
  const first = await request(app.getHttpServer())
    .post("/tasks")
    .send({ title: "Buy milk" });
  const second = await request(app.getHttpServer())
    .post("/tasks")
    .send({ title: "Walk the dog" });

  const response = await request(app.getHttpServer()).get("/tasks");

  expect(response.body).toEqual([first.body, second.body]);
});
