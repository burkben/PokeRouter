import { navUrlFor, resolveTarget } from './nav';
import type {
  NavTarget,
  SendResult,
  TeslaProvider,
  TeslaStatus,
  TeslaVehicle,
} from './types';

const MOCK_VEHICLES: TeslaVehicle[] = [
  { id: '100021', vin: '5YJ3E1EA7PF000000', displayName: 'Ash’s Model 3', state: 'online' },
  { id: '100022', vin: '5YJYGDEE1LF000000', displayName: 'Misty’s Model Y', state: 'asleep' },
];

/**
 * A fully offline Tesla stand-in for demos and local development. Enable with
 * TESLA_MOCK=1. The connect flow is instantaneous (no real OAuth), vehicles are
 * canned, and "send to car" records the last navigation URL so the UI can show
 * exactly what would have been transmitted.
 */
export class MockTeslaProvider implements TeslaProvider {
  readonly mode = 'mock' as const;
  private connected = false;
  lastSent: { vehicle: string; url: string } | null = null;

  async status(): Promise<TeslaStatus> {
    return {
      mode: 'mock',
      configured: true,
      connected: this.connected,
      vehicleCount: this.connected ? MOCK_VEHICLES.length : undefined,
    };
  }

  authorizeUrl(): string | null {
    // No real OAuth in mock; the login route connects directly.
    return null;
  }

  async handleCallback(): Promise<void> {
    this.connected = true;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async listVehicles(): Promise<TeslaVehicle[]> {
    this.ensureConnected();
    return MOCK_VEHICLES;
  }

  async sendNavigation(vehicleTag: string, target: NavTarget): Promise<SendResult> {
    this.ensureConnected();
    const vehicle = MOCK_VEHICLES.find((v) => v.id === vehicleTag || v.vin === vehicleTag);
    if (!vehicle) throw new Error(`Unknown vehicle: ${vehicleTag}`);
    const leg = resolveTarget(target);
    const url = navUrlFor(target);
    this.lastSent = { vehicle: vehicle.displayName, url };
    return {
      sent: true,
      url,
      vehicle: vehicle.displayName,
      targetIndex: leg.index,
      targetName: leg.point.name,
      waypointCount: leg.count,
      isFinal: leg.isFinal,
    };
  }

  private ensureConnected(): void {
    if (!this.connected) throw new Error('Not connected to Tesla (mock).');
  }
}
