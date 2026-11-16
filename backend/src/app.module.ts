import { Module } from "@nestjs/common";
import { HealthController } from "./health/health.controller";
import { InMemoryTaskRepository } from "./tasks/in-memory-task.repository";
import { TaskRepository } from "./tasks/task.repository";
import { TasksController } from "./tasks/tasks.controller";
import { TasksService } from "./tasks/tasks.service";

@Module({
  controllers: [HealthController, TasksController],
  providers: [
    TasksService,
    { provide: TaskRepository, useClass: InMemoryTaskRepository },
  ],
})
export class AppModule {}
