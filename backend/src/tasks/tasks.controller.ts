import { Body, Controller, Get, Post } from "@nestjs/common";
import { CreateTaskPipe } from "./create-task.pipe";
import { TasksService } from "./tasks.service";

@Controller("tasks")
export class TasksController {
  constructor(private readonly service: TasksService) {}

  @Get()
  async findAll() {
    return this.service.findAll();
  }

  @Post()
  async create(@Body(CreateTaskPipe) body: { title: string }) {
    return this.service.create(body.title);
  }
}
