import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

/**
 * Raised when a third-party credential resolves to null. Surfaces as 503 with an
 * actionable message rather than a 500 stack trace — an unconfigured integration
 * is an operator task, not a bug.
 */
export class ServiceUnconfiguredError extends HttpException {
  constructor(service: string, hint: string) {
    super(
      {
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        error: 'ServiceUnconfigured',
        service,
        message: `${service} is not configured. ${hint}`,
      },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}

interface ErrorBody {
  statusCode: number;
  message: string;
  error?: string;
  [key: string]: unknown;
}

/** Normalises every thrown value into `{ statusCode, message, error }` JSON. */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Http');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: ErrorBody = { statusCode: status, message: 'Something went wrong.' };

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const payload = exception.getResponse();
      body =
        typeof payload === 'string'
          ? { statusCode: status, message: payload }
          : { statusCode: status, ...(payload as Record<string, unknown>) } as ErrorBody;
      if (Array.isArray(body.message)) body.message = body.message.join(' ');
    } else {
      this.logger.error(
        `Unhandled ${request.method} ${request.url}: ${
          exception instanceof Error ? exception.stack : String(exception)
        }`,
      );
    }

    response.status(status).json(body);
  }
}
