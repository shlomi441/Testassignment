import { beforeEach, expect, it, jest } from "@jest/globals";
import { Logger } from "@nestjs/common";
import type { Request, Response } from "express";
import { EventEmitter } from "node:events";
import { requestLogger } from "./request-logger";

const log = jest.spyOn(Logger.prototype, "log").mockReturnValue(undefined);
const next = jest.fn();
const getTasks = { method: "GET", originalUrl: "/tasks", path: "/tasks" };

jest.useFakeTimers();

beforeEach(() => {
  jest.clearAllMocks();
});

function receive(request: Pick<Request, "method" | "originalUrl" | "path">) {
  const response = Object.assign(new EventEmitter(), {
    statusCode: 200,
    writableFinished: false,
  });
  requestLogger(request as Request, response as Response, next);
  return response;
}

function complete(response: ReturnType<typeof receive>) {
  response.writableFinished = true;
  response.emit("finish");
  response.emit("close");
}

it("writes nothing before the response closes, and calls next once", () => {
  receive(getTasks);

  expect(log).not.toHaveBeenCalled();
  expect(next).toHaveBeenCalledTimes(1);
});

it("writes one line with method, path, status, durationMs and aborted false when a finished response closes", () => {
  const response = receive({
    method: "POST",
    originalUrl: "/tasks",
    path: "/tasks",
  });
  response.statusCode = 201;

  complete(response);

  expect(log).toHaveBeenCalledTimes(1);
  expect(log).toHaveBeenCalledWith({
    method: "POST",
    path: "/tasks",
    status: 201,
    durationMs: expect.any(Number),
    aborted: false,
  });
});

it("the path carries no query string", () => {
  const response = receive({
    method: "GET",
    originalUrl: "/tasks?done=true",
    path: "/tasks",
  });

  complete(response);

  expect(log).toHaveBeenCalledWith(expect.objectContaining({ path: "/tasks" }));
});

it("durationMs is the time between the request and the close", () => {
  jest.advanceTimersByTime(1000);
  const response = receive(getTasks);
  jest.advanceTimersByTime(41.6);

  complete(response);

  expect(log).toHaveBeenCalledWith(expect.objectContaining({ durationMs: 42 }));
});

it("aborted is true when the response closes unfinished", () => {
  const response = receive(getTasks);

  response.emit("close");

  expect(log).toHaveBeenCalledWith(expect.objectContaining({ aborted: true }));
});
