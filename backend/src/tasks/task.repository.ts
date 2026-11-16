export interface Task {
  id: string;
  title: string;
  createdAt: string;
}

export abstract class TaskRepository {
  abstract create(task: Task): Promise<void>;
  abstract findAll(): Promise<Task[]>;
}
