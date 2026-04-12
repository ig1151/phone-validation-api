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
