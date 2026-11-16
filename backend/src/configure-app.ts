import type { INestApplication } from "@nestjs/common";
import { requestLogger } from "./logging/request-logger";

export function configureApp(app: INestApplication) {
  app.use(requestLogger);
}
