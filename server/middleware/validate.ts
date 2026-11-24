import type { NextFunction, Request, Response } from 'express';
import { type ZodSchema } from 'zod';

function containsMongoOperators(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(containsMongoOperators);
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, val] of Object.entries(value)) {
      if (key.startsWith('$') || key.includes('.')) {
        return true;
      }
      if (containsMongoOperators(val)) {
        return true;
      }
    }
  }
  return false;
}

export function rejectNoSqlOperators(req: Request, res: Response, next: NextFunction): void {
  if (containsMongoOperators(req.body) || containsMongoOperators(req.query)) {
    res.status(400).json({ error: 'Invalid characters detected in request payload.' });
    return;
  }
  next();
}

export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      res.status(400).json({
        error: firstIssue ? `${firstIssue.path.join('.') || 'Input'}: ${firstIssue.message}` : 'Validation failed',
        details: parsed.error.issues,
      });
      return;
    }
    req.body = parsed.data;
    next();
  };
}
