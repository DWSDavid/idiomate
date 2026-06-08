import type { NextFunction, Request, Response } from 'express';

function headerValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

export function accessMiddleware(accessCode: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!accessCode) {
      next();
      return;
    }

    const submitted = headerValue(req.headers['x-access-code']).trim();
    if (submitted !== accessCode) {
      res.status(401).json({ error: 'Access code required.' });
      return;
    }

    next();
  };
}
