import { Router, Request, Response, NextFunction } from 'express';
import { validateSchema, batchSchema } from '../utils/validation';
import { validatePhone } from '../services/phone.service';
import type { ValidateRequest, BatchRequest } from '../types/index';
export const validateRouter = Router();

validateRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const phone = (req.query.phone as string || '').trim();
    const country_code = (req.query.country_code as string || '').trim() || undefined;
    if (!phone) { res.status(422).json({ error: { code: 'VALIDATION_ERROR', message: 'phone query parameter is required' } }); return; }
    const { error, value } = validateSchema.validate({ phone, country_code }, { abortEarly: false });
    if (error) { res.status(422).json({ error: { code: 'VALIDATION_ERROR', message: 'Validation failed', details: error.details.map((d) => d.message) } }); return; }
    const result = await validatePhone(value as ValidateRequest);
    res.status(200).json(result);
  } catch (err) { next(err); }
});

validateRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { error, value } = validateSchema.validate(req.body, { abortEarly: false });
    if (error) { res.status(422).json({ error: { code: 'VALIDATION_ERROR', message: 'Validation failed', details: error.details.map((d) => d.message) } }); return; }
    const result = await validatePhone(value as ValidateRequest);
    res.status(200).json(result);
  } catch (err) { next(err); }
});

validateRouter.post('/batch', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { error, value } = batchSchema.validate(req.body, { abortEarly: false });
    if (error) { res.status(422).json({ error: { code: 'VALIDATION_ERROR', message: 'Validation failed', details: error.details.map((d) => d.message) } }); return; }
    const t0 = Date.now();
    const results = await Promise.allSettled((value as BatchRequest).phones.map((p: ValidateRequest) => validatePhone(p)));
    const out = results.map((r) => r.status === 'fulfilled' ? r.value : { error: r.reason instanceof Error ? r.reason.message : 'Unknown' });
    const valid = out.filter((r) => !('error' in r) && (r as ValidationResult).valid).length;
    const invalid = out.filter((r) => ('error' in r) || !(r as ValidationResult).valid).length;
    res.status(200).json({ batch_id: `batch_${Date.now()}`, total: (value as BatchRequest).phones.length, valid, invalid, results: out, latency_ms: Date.now() - t0 });
  } catch (err) { next(err); }
});

import type { ValidationResult } from '../types/index';
