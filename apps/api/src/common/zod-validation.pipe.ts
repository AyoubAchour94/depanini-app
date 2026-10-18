import { BadRequestException, type PipeTransform } from '@nestjs/common';
import type { z } from 'zod';

/**
 * Validates a request body (or other argument) against a zod schema from
 * `@depanini/shared` and hands the handler the parsed, normalized value:
 * `@Body(new ZodValidationPipe(schema))`.
 *
 * Invalid input is a 400 whose `issues` name each failing field by `path`.
 */
export class ZodValidationPipe<T extends z.ZodType> implements PipeTransform<unknown, z.output<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.output<T> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Validation failed',
        issues: result.error.issues.map(({ path, message }) => ({ path, message })),
      });
    }
    return result.data;
  }
}
