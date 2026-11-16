import { Test } from "@nestjs/testing";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/configure-app";
import { TaskRepository } from "../src/tasks/task.repository";

export async function createTestApp(repository?: TaskRepository) {
  const builder = Test.createTestingModule({ imports: [AppModule] });
  if (repository) {
    builder.overrideProvider(TaskRepository).useValue(repository);
  }
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  return app;
}
