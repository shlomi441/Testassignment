import { BadRequestException, type PipeTransform } from "@nestjs/common";

export class CreateTaskPipe implements PipeTransform {
  transform(body: Record<string, unknown> | undefined) {
    const title = body?.title;
    if (typeof title !== "string") {
      throw new BadRequestException("title is required and must be a string");
    }
    const trimmed = title.trim();
    if (trimmed === "") {
      throw new BadRequestException("title must not be empty");
    }
    if (trimmed.length > 200) {
      throw new BadRequestException("title must be at most 200 characters");
    }
    return { title: trimmed };
  }
}
