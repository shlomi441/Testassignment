import { type Task, TaskRepository } from "./task.repository";

export class InMemoryTaskRepository extends TaskRepository {
  private readonly tasks: Task[] = [];

  async create(task: Task) {
    this.tasks.push({ ...task });
    if (this.tasks.length > 100) {
      this.tasks.shift();
    }
  }

  async findAll() {
    return this.tasks.map((task) => ({ ...task }));
  }
}
