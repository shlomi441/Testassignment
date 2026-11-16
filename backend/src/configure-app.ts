import type { NestExpressApplication } from "@nestjs/platform-express";
import { join } from "node:path";
import { requestLogger } from "./logging/request-logger";

export function configureApp(app: NestExpressApplication) {
  app.use(requestLogger);
  app.disable("x-powered-by");
  app.useStaticAssets(join(__dirname, "..", "public"));
  app.useBodyParser("json");
}
