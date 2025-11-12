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
const { systemMetrics } = require('../server/systemMetrics.ts');
const { recordAuditEvent } = require('../server/audit-logger.ts');

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

function resolveActor(req, payload) {
  const ipHeader = req.headers?.['x-forwarded-for'];
  const clientIp = Array.isArray(ipHeader)
    ? ipHeader[0]
    : typeof ipHeader === 'string'
    ? ipHeader.split(',')[0]
    : null;
  return {
    id: payload?.sub,
    role: payload?.role,
    scope: payload?.scope,
    ip: clientIp || req.socket?.remoteAddress || undefined,
    userAgent: req.headers?.['user-agent'],
  };
}

function audit(action, status, req, payload, target, metadata) {
  recordAuditEvent({
    action,
    status,
    actor: resolveActor(req, payload),
    target,
    metadata,
  }).catch((error) => console.warn('[audit] Failed to record audit event', error));
}

module.exports = function setupAnalyticsProxy(app) {
  app.post('/api/auth/token', async (req, res) => {
    const started = Date.now();
    let statusCode;
    let auditStatus = 'failure';
    let auditPayload = null;
    let auditMetadata = {};
    try {
      const payload = await parseJson(req);
      const expectedId = process.env.EDENTIST_AUTH_CLIENT_ID;
      const expectedSecret = process.env.EDENTIST_AUTH_CLIENT_SECRET;
      if (!expectedId || !expectedSecret) {
        throw new Error('Authentication secrets not configured');
      }
      if (payload.clientId !== expectedId || payload.clientSecret !== expectedSecret) {
        res.status(401).json({ status: 'error', message: 'Invalid client credentials' });
        statusCode = res.statusCode || 401;
        auditMetadata = { reason: 'invalid_credentials', clientId: payload.clientId };
        return;
      }
      const token = issueJWT({
        sub: payload.sub ?? expectedId,
        scope: payload.scope ?? ['analytics:read', 'pms:write'],
        role: payload.role ?? 'system',
      });
      res.json({ access_token: token, token_type: 'Bearer', expires_in: 3600 });
      statusCode = res.statusCode;
       auditStatus = 'success';
       auditPayload = { sub: payload.sub ?? expectedId, role: payload.role ?? 'system', scope: payload.scope };
       auditMetadata = { clientId: payload.clientId };
    } catch (error) {
      res.status(400).json({
        status: 'error',
        message: error?.message || 'Failed to issue token',
      });
      statusCode = 400;
      auditMetadata = { reason: error?.message };
    } finally {
      systemMetrics.record('auth.token', Date.now() - started, statusCode ?? res.statusCode);
      audit(
        'auth.token.issue',
        auditStatus,
        req,
        auditPayload,
        { type: 'auth', name: 'token' },
        { ...auditMetadata, statusCode: statusCode ?? res.statusCode }
      );
    }
  });

  app.post('/api/analytics/events', async (req, res) => {
    const started = Date.now();
    let statusCode;
    const authPayload = authenticate(req, res, ['analytics:write']);
    if (!authPayload) {
      statusCode = res.statusCode || 401;
      systemMetrics.record('analytics.events', Date.now() - started, statusCode);
      audit(
        'analytics.events.ingest',
        'failure',
        req,
        null,
        { type: 'analytics', name: 'events' },
        { reason: 'auth_failed' }
      );
      return;
    }
    try {
      const payload = await parseJson(req);
      await analyticsEngine.ingestEvent(payload);
      res.status(202).json({ status: 'accepted' });
      statusCode = res.statusCode;
      audit(
        'analytics.events.ingest',
        'success',
        req,
        authPayload,
        { type: 'analytics', name: 'events' },
        { eventType: payload?.type, sessionId: payload?.sessionId }
      );
    } catch (error) {
      res
        .status(400)
        .json({ status: 'error', message: error?.message || 'Invalid payload' });
      statusCode = res.statusCode || 400;
      audit(
        'analytics.events.ingest',
        'failure',
        req,
        authPayload,
        { type: 'analytics', name: 'events' },
        { reason: error?.message }
      );
    } finally {
      systemMetrics.record('analytics.events', Date.now() - started, statusCode ?? res.statusCode);
    }
  });

  app.get('/api/analytics/report', (req, res) => {
    const started = Date.now();
    let statusCode;
    try {
      const authPayload = authenticate(req, res, ['analytics:read']);
      if (!authPayload) {
        statusCode = res.statusCode || 401;
        audit(
          'analytics.report.view',
          'failure',
          req,
          null,
          { type: 'analytics', name: 'report' },
          { reason: 'auth_failed' }
        );
        return;
      }
      res.json(analyticsEngine.getReport());
      statusCode = res.statusCode;
      audit(
        'analytics.report.view',
        'success',
        req,
        authPayload,
        { type: 'analytics', name: 'report' }
      );
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: error?.message || 'Failed to generate report',
      });
      statusCode = 500;
      audit(
        'analytics.report.view',
        'failure',
        req,
        null,
        { type: 'analytics', name: 'report' },
        { reason: error?.message }
      );
    } finally {
      systemMetrics.record('analytics.report', Date.now() - started, statusCode ?? res.statusCode);
    }
  });

  app.get('/api/integrations/pms/providers', (req, res) => {
    const started = Date.now();
    let statusCode;
    try {
      const authPayload = authenticate(req, res, ['pms:read']);
      if (!authPayload) {
        statusCode = res.statusCode || 401;
        audit(
          'pms.providers.list',
          'failure',
          req,
          null,
          { type: 'pms', name: 'providers' },
          { reason: 'auth_failed' }
        );
        return;
      }
      res.json({ providers: pmsIntegration.listProviders() });
      statusCode = res.statusCode;
      audit(
        'pms.providers.list',
        'success',
        req,
        authPayload,
        { type: 'pms', name: 'providers' }
      );
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: error?.message || 'Failed to list providers',
      });
      statusCode = 500;
      audit(
        'pms.providers.list',
        'failure',
        req,
        null,
        { type: 'pms', name: 'providers' },
        { reason: error?.message }
      );
    } finally {
      systemMetrics.record('pms.providers', Date.now() - started, statusCode ?? res.statusCode);
    }
  });

  app.post('/api/integrations/pms/:provider/book', async (req, res) => {
    const started = Date.now();
    let statusCode;
    const authPayload = authenticate(req, res, ['pms:write']);
    if (!authPayload) {
      statusCode = res.statusCode || 401;
      systemMetrics.record('pms.book', Date.now() - started, statusCode);
      audit(
        'pms.booking.create',
        'failure',
        req,
        null,
        { type: 'pms', name: req.params.provider },
        { reason: 'auth_failed' }
      );
      return;
    }
    try {
      const payload = await parseJson(req);
      const result = await pmsIntegration.createBooking(
        req.params.provider,
        payload
      );
      res.status(201).json({ status: 'success', result });
      statusCode = res.statusCode;
      audit(
        'pms.booking.create',
        'success',
        req,
        authPayload,
        { type: 'pms', name: req.params.provider },
        { bookingId: result?.externalId ?? result?.payload?.id }
      );
    } catch (error) {
      const status =
        error instanceof IntegrationError ? error.status : 500;
      res.status(status).json({
        status: 'error',
        message: error.message,
        details: error.details ?? null,
      });
      statusCode = status;
      audit(
        'pms.booking.create',
        'failure',
        req,
        authPayload,
        { type: 'pms', name: req.params.provider },
        { reason: error.message }
      );
    } finally {
      systemMetrics.record('pms.book', Date.now() - started, statusCode ?? res.statusCode);
    }
  });

  app.patch('/api/integrations/pms/:provider/booking/:bookingId', async (req, res) => {
    const started = Date.now();
    let statusCode;
    const authPayload = authenticate(req, res, ['pms:write']);
    if (!authPayload) {
      statusCode = res.statusCode || 401;
      systemMetrics.record('pms.update', Date.now() - started, statusCode);
      audit(
        'pms.booking.update',
        'failure',
        req,
        null,
        { type: 'pms', name: req.params.provider },
        { bookingId: req.params.bookingId, reason: 'auth_failed' }
      );
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
      statusCode = res.statusCode;
      audit(
        'pms.booking.update',
        'success',
        req,
        authPayload,
        { type: 'pms', name: req.params.provider },
        { bookingId: req.params.bookingId }
      );
    } catch (error) {
      const status =
        error instanceof IntegrationError ? error.status : 500;
      res.status(status).json({
        status: 'error',
        message: error.message,
        details: error.details ?? null,
      });
      statusCode = status;
      audit(
        'pms.booking.update',
        'failure',
        req,
        authPayload,
        { type: 'pms', name: req.params.provider },
        { bookingId: req.params.bookingId, reason: error.message }
      );
    } finally {
      systemMetrics.record('pms.update', Date.now() - started, statusCode ?? res.statusCode);
    }
  });

  app.delete('/api/integrations/pms/:provider/booking/:bookingId', async (req, res) => {
    const started = Date.now();
    let statusCode;
    const authPayload = authenticate(req, res, ['pms:write']);
    if (!authPayload) {
      statusCode = res.statusCode || 401;
      systemMetrics.record('pms.cancel', Date.now() - started, statusCode);
      audit(
        'pms.booking.delete',
        'failure',
        req,
        null,
        { type: 'pms', name: req.params.provider },
        { bookingId: req.params.bookingId, reason: 'auth_failed' }
      );
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
      statusCode = res.statusCode;
      audit(
        'pms.booking.delete',
        'success',
        req,
        authPayload,
        { type: 'pms', name: req.params.provider },
        { bookingId: req.params.bookingId }
      );
    } catch (error) {
      const status =
        error instanceof IntegrationError ? error.status : 500;
      res.status(status).json({
        status: 'error',
        message: error.message,
        details: error.details ?? null,
      });
      statusCode = status;
      audit(
        'pms.booking.delete',
        'failure',
        req,
        authPayload,
        { type: 'pms', name: req.params.provider },
        { bookingId: req.params.bookingId, reason: error.message }
      );
    } finally {
      systemMetrics.record('pms.cancel', Date.now() - started, statusCode ?? res.statusCode);
    }
  });

  app.post('/api/integrations/pms/:provider/performance', async (req, res) => {
    const started = Date.now();
    let statusCode;
    const authPayload = authenticate(req, res, ['analytics:read', 'pms:write']);
    if (!authPayload) {
      statusCode = res.statusCode || 401;
      systemMetrics.record('pms.performance', Date.now() - started, statusCode);
      audit(
        'pms.performance.push',
        'failure',
        req,
        null,
        { type: 'pms', name: req.params.provider },
        { reason: 'auth_failed' }
      );
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
      statusCode = res.statusCode;
      audit(
        'pms.performance.push',
        'success',
        req,
        authPayload,
        { type: 'pms', name: req.params.provider },
        { reportHasPayload: Boolean(payload.report) }
      );
    } catch (error) {
      const status =
        error instanceof IntegrationError ? error.status : 500;
      res.status(status).json({
        status: 'error',
        message: error.message,
        details: error.details ?? null,
      });
      statusCode = status;
      audit(
        'pms.performance.push',
        'failure',
        req,
        authPayload,
        { type: 'pms', name: req.params.provider },
        { reason: error.message }
      );
    } finally {
      systemMetrics.record('pms.performance', Date.now() - started, statusCode ?? res.statusCode);
    }
  });
};

