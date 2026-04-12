#!/bin/bash
set -e

echo "🚀 Building Phone Validation API..."

cat > src/types/index.ts << 'HEREDOC'
export type PhoneStatus = 'valid' | 'invalid' | 'unknown';
export type LineType = 'mobile' | 'landline' | 'voip' | 'toll_free' | 'premium' | 'unknown';

export interface ValidateRequest {
  phone: string;
  country_code?: string;
}

export interface BatchRequest {
  phones: ValidateRequest[];
}

export interface ValidationResult {
  phone: string;
  status: PhoneStatus;
  valid: boolean;
  formatted: {
    e164: string;
    international: string;
    national: string;
  };
  country: {
    code: string;
    name: string;
    dial_code: string;
  };
  line_type: LineType;
  carrier?: string;
  location?: string;
  timezone?: string[];
  is_possible: boolean;
  latency_ms: number;
  created_at: string;
}

export interface BatchResponse {
  batch_id: string;
  total: number;
  valid: number;
  invalid: number;
  results: ValidationResult[];
  latency_ms: number;
}
HEREDOC

cat > src/utils/config.ts << 'HEREDOC'
import 'dotenv/config';
function optional(key: string, fallback: string): string { return process.env[key] ?? fallback; }
export const config = {
  server: { port: parseInt(optional('PORT', '3000'), 10), nodeEnv: optional('NODE_ENV', 'development'), apiVersion: optional('API_VERSION', 'v1') },
  rateLimit: { windowMs: parseInt(optional('RATE_LIMIT_WINDOW_MS', '60000'), 10), maxFree: parseInt(optional('RATE_LIMIT_MAX_FREE', '20'), 10), maxPro: parseInt(optional('RATE_LIMIT_MAX_PRO', '500'), 10) },
  logging: { level: optional('LOG_LEVEL', 'info') },
} as const;
HEREDOC

cat > src/utils/logger.ts << 'HEREDOC'
import pino from 'pino';
import { config } from './config';
export const logger = pino({
  level: config.logging.level,
  transport: config.server.nodeEnv === 'development' ? { target: 'pino-pretty', options: { colorize: true } } : undefined,
  base: { service: 'phone-validation-api' },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: { paths: ['req.headers.authorization'], censor: '[REDACTED]' },
});
HEREDOC

cat > src/utils/validation.ts << 'HEREDOC'
import Joi from 'joi';
export const validateSchema = Joi.object({
  phone: Joi.string().required().messages({ 'any.required': 'phone is required' }),
  country_code: Joi.string().length(2).uppercase().optional(),
});
export const batchSchema = Joi.object({
  phones: Joi.array().items(validateSchema).min(1).max(100).required().messages({ 'array.max': 'Batch endpoint accepts a maximum of 100 phones per request' }),
});
HEREDOC

cat > src/services/phone.service.ts << 'HEREDOC'
import { parsePhoneNumber, isValidPhoneNumber, isPossiblePhoneNumber, getCountries, getCountryCallingCode, parsePhoneNumberFromString } from 'libphonenumber-js';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import type { ValidateRequest, ValidationResult, LineType } from '../types/index';

function detectLineType(phone: string, countryCode?: string): LineType {
  try {
    const parsed = parsePhoneNumberFromString(phone, countryCode as any);
    if (!parsed) return 'unknown';
    const type = parsed.getType();
    switch (type) {
      case 'MOBILE': return 'mobile';
      case 'FIXED_LINE': return 'landline';
      case 'FIXED_LINE_OR_MOBILE': return 'mobile';
      case 'VOIP': return 'voip';
      case 'TOLL_FREE': return 'toll_free';
      case 'PREMIUM_RATE': return 'premium';
      default: return 'unknown';
    }
  } catch { return 'unknown'; }
}

const COUNTRY_NAMES: Record<string, string> = {
  US: 'United States', GB: 'United Kingdom', CA: 'Canada', AU: 'Australia',
  DE: 'Germany', FR: 'France', IT: 'Italy', ES: 'Spain', NL: 'Netherlands',
  BR: 'Brazil', MX: 'Mexico', IN: 'India', CN: 'China', JP: 'Japan',
  KR: 'South Korea', SG: 'Singapore', ZA: 'South Africa', NG: 'Nigeria',
  KE: 'Kenya', GH: 'Ghana', AE: 'United Arab Emirates', SA: 'Saudi Arabia',
  PK: 'Pakistan', BD: 'Bangladesh', PH: 'Philippines', ID: 'Indonesia',
  TH: 'Thailand', VN: 'Vietnam', MY: 'Malaysia', NZ: 'New Zealand',
  AR: 'Argentina', CO: 'Colombia', CL: 'Chile', PE: 'Peru',
  PL: 'Poland', RU: 'Russia', UA: 'Ukraine', SE: 'Sweden',
  NO: 'Norway', DK: 'Denmark', FI: 'Finland', CH: 'Switzerland',
  AT: 'Austria', BE: 'Belgium', PT: 'Portugal', GR: 'Greece',
  TR: 'Turkey', IL: 'Israel', EG: 'Egypt', MA: 'Morocco',
};

export async function validatePhone(req: ValidateRequest): Promise<ValidationResult> {
  const t0 = Date.now();
  const phone = req.phone.trim();
  const id = uuidv4().slice(0, 8);

  logger.info({ id, phone }, 'Starting phone validation');

  try {
    const countryCode = req.country_code?.toUpperCase();
    const parsed = parsePhoneNumberFromString(phone, countryCode as any);

    if (!parsed) {
      return {
        phone,
        status: 'invalid',
        valid: false,
        formatted: { e164: '', international: '', national: '' },
        country: { code: '', name: '', dial_code: '' },
        line_type: 'unknown',
        is_possible: false,
        latency_ms: Date.now() - t0,
        created_at: new Date().toISOString(),
      };
    }

    const isValid = parsed.isValid();
    const isPossible = parsed.isPossible();
    const country = parsed.country ?? countryCode ?? '';
    const dialCode = country ? `+${getCountryCallingCode(country as any)}` : '';
    const lineType = detectLineType(phone, countryCode);

    logger.info({ id, isValid, country, lineType }, 'Validation complete');

    return {
      phone,
      status: isValid ? 'valid' : isPossible ? 'unknown' : 'invalid',
      valid: isValid,
      formatted: {
        e164: parsed.format('E.164'),
        international: parsed.formatInternational(),
        national: parsed.formatNational(),
      },
      country: {
        code: country,
        name: COUNTRY_NAMES[country] ?? country,
        dial_code: dialCode,
      },
      line_type: lineType,
      location: parsed.country ? undefined : undefined,
      timezone: parsed.getType() ? undefined : undefined,
      is_possible: isPossible,
      latency_ms: Date.now() - t0,
      created_at: new Date().toISOString(),
    };
  } catch (err) {
    logger.error({ id, phone, err }, 'Validation error');
    return {
      phone,
      status: 'invalid',
      valid: false,
      formatted: { e164: '', international: '', national: '' },
      country: { code: '', name: '', dial_code: '' },
      line_type: 'unknown',
      is_possible: false,
      latency_ms: Date.now() - t0,
      created_at: new Date().toISOString(),
    };
  }
}
HEREDOC

cat > src/middleware/error.middleware.ts << 'HEREDOC'
import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  logger.error({ err, path: req.path }, 'Unhandled error');
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } });
}
export function notFound(req: Request, res: Response): void { res.status(404).json({ error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.path} not found` } }); }
HEREDOC

cat > src/middleware/ratelimit.middleware.ts << 'HEREDOC'
import rateLimit from 'express-rate-limit';
import { config } from '../utils/config';
export const rateLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs, max: config.rateLimit.maxFree,
  standardHeaders: 'draft-7', legacyHeaders: false,
  keyGenerator: (req) => req.headers['authorization']?.replace('Bearer ', '') ?? req.ip ?? 'unknown',
  handler: (_req, res) => { res.status(429).json({ error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests.' } }); },
});
HEREDOC

cat > src/routes/health.route.ts << 'HEREDOC'
import { Router, Request, Response } from 'express';
export const healthRouter = Router();
const startTime = Date.now();
healthRouter.get('/', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', version: '1.0.0', uptime_seconds: Math.floor((Date.now() - startTime) / 1000), timestamp: new Date().toISOString() });
});
HEREDOC

cat > src/routes/validate.route.ts << 'HEREDOC'
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
HEREDOC

cat > src/routes/openapi.route.ts << 'HEREDOC'
import { Router, Request, Response } from 'express';
import { config } from '../utils/config';
export const openapiRouter = Router();
export const docsRouter = Router();

const docsHtml = `<!DOCTYPE html>
<html>
<head>
  <title>Phone Validation API — Docs</title>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: system-ui, sans-serif; max-width: 800px; margin: 0 auto; padding: 2rem; color: #333; }
    h1 { font-size: 1.8rem; margin-bottom: 0.25rem; }
    h2 { font-size: 1.2rem; margin-top: 2rem; border-bottom: 1px solid #eee; padding-bottom: 0.5rem; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; margin-right: 8px; }
    .get { background: #e3f2fd; color: #1565c0; }
    .post { background: #e8f5e9; color: #2e7d32; }
    .endpoint { background: #f5f5f5; padding: 1rem; border-radius: 8px; margin-bottom: 1rem; }
    .path { font-family: monospace; font-size: 1rem; font-weight: bold; }
    .desc { color: #666; font-size: 0.9rem; margin-top: 0.25rem; }
    pre { background: #1e1e1e; color: #d4d4d4; padding: 1rem; border-radius: 6px; overflow-x: auto; font-size: 13px; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th, td { text-align: left; padding: 8px; border: 1px solid #ddd; }
    th { background: #f5f5f5; }
  </style>
</head>
<body>
  <h1>Phone Validation API</h1>
  <p>Validate any phone number instantly — format detection, line type, country identification and E.164 formatting.</p>
  <p><strong>Base URL:</strong> <code>https://phone-validation-api.onrender.com</code></p>

  <h2>Endpoints</h2>
  <div class="endpoint">
    <div><span class="badge get">GET</span><span class="path">/v1/validate</span></div>
    <div class="desc">Validate a single phone number via query parameter</div>
    <pre>curl "https://phone-validation-api.onrender.com/v1/validate?phone=+14155552671"</pre>
  </div>
  <div class="endpoint">
    <div><span class="badge get">GET</span><span class="path">/v1/validate?phone=&country_code=</span></div>
    <div class="desc">Validate with country hint for local numbers</div>
    <pre>curl "https://phone-validation-api.onrender.com/v1/validate?phone=4155552671&country_code=US"</pre>
  </div>
  <div class="endpoint">
    <div><span class="badge post">POST</span><span class="path">/v1/validate</span></div>
    <div class="desc">Validate a single phone via request body</div>
    <pre>curl -X POST https://phone-validation-api.onrender.com/v1/validate \\
  -H "Content-Type: application/json" \\
  -d '{"phone": "+14155552671"}'</pre>
  </div>
  <div class="endpoint">
    <div><span class="badge post">POST</span><span class="path">/v1/validate/batch</span></div>
    <div class="desc">Validate up to 100 phone numbers in one request</div>
    <pre>curl -X POST https://phone-validation-api.onrender.com/v1/validate/batch \\
  -H "Content-Type: application/json" \\
  -d '{"phones": [{"phone": "+14155552671"}, {"phone": "+447911123456"}]}'</pre>
  </div>

  <h2>Example Response</h2>
  <pre>{
  "phone": "+14155552671",
  "status": "valid",
  "valid": true,
  "formatted": {
    "e164": "+14155552671",
    "international": "+1 415 555 2671",
    "national": "(415) 555-2671"
  },
  "country": {
    "code": "US",
    "name": "United States",
    "dial_code": "+1"
  },
  "line_type": "mobile",
  "is_possible": true,
  "latency_ms": 2,
  "created_at": "2026-04-12T00:00:00.000Z"
}</pre>

  <h2>Line types</h2>
  <table>
    <tr><th>Type</th><th>Description</th></tr>
    <tr><td>mobile</td><td>Mobile/cell phone number</td></tr>
    <tr><td>landline</td><td>Fixed line / home or office phone</td></tr>
    <tr><td>voip</td><td>Voice over IP number</td></tr>
    <tr><td>toll_free</td><td>Toll-free number (e.g. 800 numbers)</td></tr>
    <tr><td>premium</td><td>Premium rate number</td></tr>
    <tr><td>unknown</td><td>Could not determine line type</td></tr>
  </table>

  <h2>OpenAPI Spec</h2>
  <p><a href="/openapi.json">Download openapi.json</a></p>
</body>
</html>`;

docsRouter.get('/', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(docsHtml);
});

openapiRouter.get('/', (_req: Request, res: Response) => {
  res.status(200).json({
    openapi: '3.0.3',
    info: { title: 'Phone Validation API', version: '1.0.0', description: 'Validate phone numbers — format, line type, country and E.164 formatting.' },
    servers: [{ url: 'https://phone-validation-api.onrender.com', description: 'Production' }, { url: `http://localhost:${config.server.port}`, description: 'Local' }],
    paths: {
      '/v1/health': { get: { summary: 'Health check', operationId: 'getHealth', responses: { '200': { description: 'Service is healthy' } } } },
      '/v1/validate': {
        get: { summary: 'Validate a phone number via GET', operationId: 'validatePhoneGet', parameters: [{ name: 'phone', in: 'query', required: true, schema: { type: 'string' } }, { name: 'country_code', in: 'query', required: false, schema: { type: 'string' } }], responses: { '200': { description: 'Validation result' }, '422': { description: 'Validation error' } } },
        post: { summary: 'Validate a phone number via POST', operationId: 'validatePhonePost', requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidateRequest' } } } }, responses: { '200': { description: 'Validation result' } } },
      },
      '/v1/validate/batch': { post: { summary: 'Validate up to 100 phone numbers', operationId: 'validateBatch', requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/BatchRequest' } } } }, responses: { '200': { description: 'Batch results' } } } },
    },
    components: {
      schemas: {
        ValidateRequest: { type: 'object', required: ['phone'], properties: { phone: { type: 'string', example: '+14155552671' }, country_code: { type: 'string', example: 'US' } } },
        BatchRequest: { type: 'object', required: ['phones'], properties: { phones: { type: 'array', items: { $ref: '#/components/schemas/ValidateRequest' }, minItems: 1, maxItems: 100 } } },
      },
    },
  });
});
HEREDOC

cat > src/app.ts << 'HEREDOC'
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import pinoHttp from 'pino-http';
import { validateRouter } from './routes/validate.route';
import { healthRouter } from './routes/health.route';
import { openapiRouter, docsRouter } from './routes/openapi.route';
import { errorHandler, notFound } from './middleware/error.middleware';
import { rateLimiter } from './middleware/ratelimit.middleware';
import { logger } from './utils/logger';
import { config } from './utils/config';
const app = express();
app.use(helmet()); app.use(cors()); app.use(compression());
app.use(pinoHttp({ logger }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(`/${config.server.apiVersion}/validate`, rateLimiter);
app.use(`/${config.server.apiVersion}/validate`, validateRouter);
app.use(`/${config.server.apiVersion}/health`, healthRouter);
app.use('/openapi.json', openapiRouter);
app.use('/docs', docsRouter);
app.get('/', (_req, res) => res.redirect(`/${config.server.apiVersion}/health`));
app.use(notFound);
app.use(errorHandler);
export { app };
HEREDOC

cat > src/index.ts << 'HEREDOC'
import { app } from './app';
import { config } from './utils/config';
import { logger } from './utils/logger';
const server = app.listen(config.server.port, () => { logger.info({ port: config.server.port, env: config.server.nodeEnv }, '🚀 Phone Validation API started'); });
const shutdown = (signal: string) => { logger.info({ signal }, 'Shutting down'); server.close(() => { logger.info('Closed'); process.exit(0); }); setTimeout(() => process.exit(1), 10_000); };
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => logger.error({ reason }, 'Unhandled rejection'));
process.on('uncaughtException', (err) => { logger.fatal({ err }, 'Uncaught exception'); process.exit(1); });
HEREDOC

cat > jest.config.js << 'HEREDOC'
module.exports = { preset: 'ts-jest', testEnvironment: 'node', rootDir: '.', testMatch: ['**/tests/**/*.test.ts'], collectCoverageFrom: ['src/**/*.ts', '!src/index.ts'], setupFiles: ['<rootDir>/tests/setup.ts'] };
HEREDOC

cat > tests/setup.ts << 'HEREDOC'
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
HEREDOC

cat > .gitignore << 'HEREDOC'
node_modules/
dist/
.env
coverage/
*.log
.DS_Store
HEREDOC

cat > render.yaml << 'HEREDOC'
services:
  - type: web
    name: phone-validation-api
    runtime: node
    buildCommand: npm install && npm run build
    startCommand: node dist/index.js
    healthCheckPath: /v1/health
    envVars:
      - key: NODE_ENV
        value: production
      - key: LOG_LEVEL
        value: info
HEREDOC

echo ""
echo "✅ All files created! Run: npm install"