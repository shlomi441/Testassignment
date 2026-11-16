import { expect, it } from "@jest/globals";
import { BadRequestException } from "@nestjs/common";
import { CreateTaskPipe } from "./create-task.pipe";

const pipe = new CreateTaskPipe();

it.each([
  ["without a title", {}],
  ["with a numeric title", { title: 42 }],
  ["with a null title", { title: null }],
  ["that is missing", undefined],
])("rejects a body %s", (_case, body) => {
  expect(() => pipe.transform(body)).toThrow(
    new BadRequestException("title is required and must be a string"),
  );
});

it("rejects an empty title", () => {
  expect(() => pipe.transform({ title: "" })).toThrow(
    new BadRequestException("title must not be empty"),
  );
});

it("rejects a title of whitespace only", () => {
  expect(() => pipe.transform({ title: " \t\n " })).toThrow(
    new BadRequestException("title must not be empty"),
  );
});

it("rejects a title of 201 characters after trimming", () => {
  expect(() => pipe.transform({ title: ` ${"a".repeat(201)} ` })).toThrow(
    new BadRequestException("title must be at most 200 characters"),
  );
});

it("accepts a title of exactly 200 characters", () => {
  const title = "a".repeat(200);

  expect(pipe.transform({ title: ` ${title} ` })).toEqual({ title });
});

it("hands on the trimmed title", () => {
  expect(pipe.transform({ title: "  Buy milk  " })).toEqual({
    title: "Buy milk",
  });
});

it("hands on nothing but the title", () => {
  expect(pipe.transform({ title: "Buy milk", done: true })).toEqual({
    title: "Buy milk",
  });
});
