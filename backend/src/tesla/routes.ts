import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { NamedPoint } from '../share/links';
import type { TeslaConfig } from './config';
import type { NavTarget, TeslaProvider } from './types';

interface Deps {
  config: TeslaConfig;
  provider: TeslaProvider | null;
}

const namedPointSchema = {
  type: 'object',
  required: ['lat', 'lng'],
  properties: {
    lat: { type: 'number', minimum: -90, maximum: 90 },
    lng: { type: 'number', minimum: -180, maximum: 180 },
    name: { type: 'string', maxLength: 200 },
  },
} as const;

const sendBodySchema = {
  type: 'object',
  required: ['vehicleTag', 'destination'],
  properties: {
    vehicleTag: { type: 'string', minLength: 1, maxLength: 64 },
    origin: namedPointSchema,
    destination: namedPointSchema,
    stops: { type: 'array', items: namedPointSchema, maxItems: 50 },
  },
} as const;

interface SendBody {
  vehicleTag: string;
  origin?: NamedPoint;
  destination: NamedPoint;
  stops?: NamedPoint[];
}

/**
 * Tesla "send to car" endpoints. Works identically against the mock and live
 * providers; when Tesla is disabled the routes still exist and report it
 * honestly so the web client can hide the panel.
 */
export function registerTeslaRoutes(app: FastifyInstance, { config, provider }: Deps): void {
  // Anti-CSRF: states we've issued and are awaiting on the OAuth callback.
  const pendingStates = new Set<string>();

  // Domain-registration key for the Fleet API. Served regardless of mode so the
  // file is reachable while setting up a developer account.
  app.get('/.well-known/appspecific/com.tesla.3p.public-key.pem', async (_req, reply) => {
    if (!config.publicKeyPem) {
      return reply.code(404).send('No Tesla public key configured.');
    }
    return reply.header('content-type', 'application/x-pem-file').send(config.publicKeyPem);
  });

  app.get('/tesla/status', async () => {
    if (!provider) {
      return { mode: 'disabled' as const, configured: false, connected: false };
    }
    return provider.status();
  });

  app.get('/tesla/auth/login', async (_req, reply) => {
    if (!provider) return disabled(reply);
    const state = randomUUID();
    pendingStates.add(state);

    const url = provider.authorizeUrl(state);
    if (url) {
      // Live: hand the browser to Tesla's consent screen.
      return reply.redirect(url);
    }

    // Mock: no real OAuth — connect immediately and bounce back to the app.
    await provider.handleCallback('mock-code', state);
    pendingStates.delete(state);
    return reply.redirect(`${config.webReturnUrl}?tesla=connected`);
  });

  app.get<{ Querystring: { code?: string; state?: string; error?: string } }>(
    '/tesla/auth/callback',
    async (req, reply) => {
      if (!provider) return disabled(reply);
      const { code, state, error } = req.query;

      if (error) return reply.redirect(`${config.webReturnUrl}?tesla=error`);
      if (!code || !state || !pendingStates.has(state)) {
        return reply.redirect(`${config.webReturnUrl}?tesla=error`);
      }
      pendingStates.delete(state);

      try {
        await provider.handleCallback(code, state);
        return reply.redirect(`${config.webReturnUrl}?tesla=connected`);
      } catch (err) {
        req.log.error({ err }, 'tesla: OAuth callback failed');
        return reply.redirect(`${config.webReturnUrl}?tesla=error`);
      }
    },
  );

  app.get('/tesla/vehicles', async (_req, reply) => {
    if (!provider) return disabled(reply);
    if (!provider.isConnected()) {
      return reply.code(409).send({ error: 'not_connected' });
    }
    const vehicles = await provider.listVehicles();
    return { vehicles };
  });

  app.post<{ Body: SendBody }>(
    '/tesla/send',
    { schema: { body: sendBodySchema } },
    async (req, reply) => {
      if (!provider) return disabled(reply);
      if (!provider.isConnected()) {
        return reply.code(409).send({ error: 'not_connected' });
      }
      const { vehicleTag, origin, destination, stops } = req.body;
      const target: NavTarget = { origin, destination, stops };
      try {
        return await provider.sendNavigation(vehicleTag, target);
      } catch (err) {
        req.log.error({ err }, 'tesla: send failed');
        return reply.code(502).send({ error: 'send_failed', message: (err as Error).message });
      }
    },
  );
}

function disabled(reply: FastifyReply): FastifyReply {
  reply.code(503).send({ error: 'tesla_disabled', message: 'Tesla integration is not configured.' });
  return reply;
}
