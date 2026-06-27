import { MachineStore } from '../catalog/machineStore';
import { selectRoutingProvider } from '../routing';
import { buildApp } from './app';

const PORT = Number(process.env.PORT ?? 8080);
const HOST = process.env.HOST ?? '0.0.0.0';

async function main(): Promise<void> {
  const store = await MachineStore.load();
  const routing = selectRoutingProvider();
  const app = buildApp({ store, routing });
  await app.listen({ port: PORT, host: HOST });
}

main().catch((err) => {
  console.error('Server failed to start:', err);
  process.exit(1);
});
