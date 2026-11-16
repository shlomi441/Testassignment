import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { TaskRepository } from "./task.repository";

@Injectable()
export class TasksService {
  constructor(private readonly repository: TaskRepository) {}

  async create(title: string) {
    const task = {
      id: randomUUID(),
      title,
      createdAt: new Date().toISOString(),
    };
    await this.repository.create(task);
    return task;
  }

  async findAll() {
    return this.repository.findAll();
  }
}
