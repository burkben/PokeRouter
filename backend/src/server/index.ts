import { MachineStore } from '../catalog/machineStore';
import { selectRoutingProvider } from '../routing';
import { buildApp } from './app';

// Load backend/.env into process.env (Node-native, no dependency). The server's
// cwd is the backend/ package, so this picks up backend/.env. A missing file is
// non-fatal — real environment variables still apply.
try {
  process.loadEnvFile();
} catch {
  // No .env file present; rely on the ambient environment.
}

const PORT = Number(process.env.PORT ?? 8080);
const HOST = process.env.HOST ?? '0.0.0.0';

async function main(): Promise<void> {
  const store = await MachineStore.load();
  const routing = await selectRoutingProvider();
  const app = buildApp({ store, routing });
  await app.listen({ port: PORT, host: HOST });
  app.log.info(
    `Routing provider: ${routing.name} (road routing: ${routing.isRoadRouting})`,
  );
}

main().catch((err) => {
  console.error('Server failed to start:', err);
  process.exit(1);
});
