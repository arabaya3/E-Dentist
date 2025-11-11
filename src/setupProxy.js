if (!process.env.TS_NODE_REGISTERED) {
  require('ts-node').register({
    transpileOnly: true,
    compilerOptions: {
      module: 'commonjs',
      moduleResolution: 'node',
      esModuleInterop: true,
    },
  });
  process.env.TS_NODE_REGISTERED = 'true';
}

const analyticsEngine = require('../server/analytics-engine');
const { pmsIntegration, IntegrationError } = require('../server/pmsIntegration');
const { issueJWT, verifyJWT, requireScope } = require('../server/auth.ts');

function parseJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error('Payload too large'));
        req.connection?.destroy();
      }
    });
    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', (err) => reject(err));
  });
}

function authenticate(req, res, scopes = []) {
  const header = req.headers?.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    res.status(401).json({ status: 'error', message: 'Authorization token required' });
    return null;
  }
  try {
    const payload = verifyJWT(token);
    requireScope(scopes)(payload);
    return payload;
  } catch (error) {
    res
      .status(401)
      .json({ status: 'error', message: 'Invalid or expired token', details: error.message });
    return null;
  }
}

module.exports = function setupAnalyticsProxy(app) {
  app.post('/api/auth/token', async (req, res) => {
    try {
      const payload = await parseJson(req);
      const expectedId = process.env.EDENTIST_AUTH_CLIENT_ID;
      const expectedSecret = process.env.EDENTIST_AUTH_CLIENT_SECRET;
      if (!expectedId || !expectedSecret) {
        throw new Error('Authentication secrets not configured');
      }
      if (payload.clientId !== expectedId || payload.clientSecret !== expectedSecret) {
        res.status(401).json({ status: 'error', message: 'Invalid client credentials' });
        return;
      }
      const token = issueJWT({
        sub: payload.sub ?? expectedId,
        scope: payload.scope ?? ['analytics:read', 'pms:write'],
        role: payload.role ?? 'system',
      });
      res.json({ access_token: token, token_type: 'Bearer', expires_in: 3600 });
    } catch (error) {
      res.status(400).json({
        status: 'error',
        message: error?.message || 'Failed to issue token',
      });
    }
  });

  app.post('/api/analytics/events', async (req, res) => {
    if (!authenticate(req, res, ['analytics:write'])) {
      return;
    }
    try {
      const payload = await parseJson(req);
      await analyticsEngine.ingestEvent(payload);
      res.status(202).json({ status: 'accepted' });
    } catch (error) {
      res
        .status(400)
        .json({ status: 'error', message: error?.message || 'Invalid payload' });
    }
  });

  app.get('/api/analytics/report', (req, res) => {
    if (!authenticate(req, res, ['analytics:read'])) {
      return;
    }
    res.json(analyticsEngine.getReport());
  });

  app.get('/api/integrations/pms/providers', (req, res) => {
    if (!authenticate(req, res, ['pms:read'])) {
      return;
    }
    res.json({ providers: pmsIntegration.listProviders() });
  });

  app.post('/api/integrations/pms/:provider/book', async (req, res) => {
    if (!authenticate(req, res, ['pms:write'])) {
      return;
    }
    try {
      const payload = await parseJson(req);
      const result = await pmsIntegration.createBooking(
        req.params.provider,
        payload
      );
      res.status(201).json({ status: 'success', result });
    } catch (error) {
      const status =
        error instanceof IntegrationError ? error.status : 500;
      res.status(status).json({
        status: 'error',
        message: error.message,
        details: error.details ?? null,
      });
    }
  });

  app.patch('/api/integrations/pms/:provider/booking/:bookingId', async (req, res) => {
    if (!authenticate(req, res, ['pms:write'])) {
      return;
    }
    try {
      const payload = await parseJson(req);
      const result = await pmsIntegration.updateBooking(
        req.params.provider,
        req.params.bookingId,
        payload
      );
      res.json({ status: 'success', result });
    } catch (error) {
      const status =
        error instanceof IntegrationError ? error.status : 500;
      res.status(status).json({
        status: 'error',
        message: error.message,
        details: error.details ?? null,
      });
    }
  });

  app.delete('/api/integrations/pms/:provider/booking/:bookingId', async (req, res) => {
    if (!authenticate(req, res, ['pms:write'])) {
      return;
    }
    try {
      const payload = await parseJson(req);
      const result = await pmsIntegration.cancelBooking(
        req.params.provider,
        req.params.bookingId,
        payload
      );
      res.json({ status: 'success', result });
    } catch (error) {
      const status =
        error instanceof IntegrationError ? error.status : 500;
      res.status(status).json({
        status: 'error',
        message: error.message,
        details: error.details ?? null,
      });
    }
  });

  app.post('/api/integrations/pms/:provider/performance', async (req, res) => {
    if (!authenticate(req, res, ['analytics:read', 'pms:write'])) {
      return;
    }
    try {
      const payload = await parseJson(req);
      const reportPayload = payload.report
        ? payload
        : { ...payload, report: analyticsEngine.getReport() };
      const result = await pmsIntegration.pushPerformanceReport(
        req.params.provider,
        reportPayload
      );
      res.status(202).json({ status: 'success', result });
    } catch (error) {
      const status =
        error instanceof IntegrationError ? error.status : 500;
      res.status(status).json({
        status: 'error',
        message: error.message,
        details: error.details ?? null,
      });
    }
  });
};

