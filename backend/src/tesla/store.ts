import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export interface TeslaTokens {
  accessToken: string;
  refreshToken: string;
  /** Epoch ms when the access token expires. */
  expiresAt: number;
}

/**
 * Holds the connected user's Tesla tokens. Kept in memory, and — when
 * TESLA_TOKEN_FILE is set — mirrored to a git-ignored JSON file so a restart
 * doesn't force the user to re-authorize. Single-user by design (this is a
 * personal planner); a multi-user deployment would key this by account.
 */
export class TokenStore {
  private tokens: TeslaTokens | null = null;

  constructor(private readonly filePath?: string) {
    if (filePath) this.loadFromDisk();
  }

  get(): TeslaTokens | null {
    return this.tokens;
  }

  set(tokens: TeslaTokens): void {
    this.tokens = tokens;
    this.persist();
  }

  clear(): void {
    this.tokens = null;
    this.persist();
  }

  private loadFromDisk(): void {
    if (!this.filePath) return;
    try {
      const raw = readFileSync(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as TeslaTokens;
      if (parsed?.accessToken && parsed?.refreshToken) this.tokens = parsed;
    } catch {
      // No persisted tokens yet; that's fine.
    }
  }

  private persist(): void {
    if (!this.filePath) return;
    try {
      mkdirSync(dirname(this.filePath), { recursive: true });
      writeFileSync(this.filePath, JSON.stringify(this.tokens), 'utf8');
    } catch (err) {
      console.warn('[tesla] Could not persist tokens:', (err as Error).message);
    }
  }
}
