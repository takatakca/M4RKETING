// What an app plugs into the kit (lib/domain/index.ts exports `hooks`). Every hook is optional.
export interface CloverEvent {
  merchantId: string;
  /** Clover object type: O orders, P payments, I inventory, C customers, E employees, CA cash, M merchant… */
  prefix: string;
  objectId: string;
  type: 'CREATE' | 'UPDATE' | 'DELETE' | string;
  ts: number | null;
}

export interface SuiteEvent {
  id: string;
  type: 'order.created' | 'order.status_changed' | 'app.event' | string;
  createdAt: string;
  source: string;
  data: Record<string, any>;
}

export interface AppHooks {
  /** A Clover webhook event for a connected merchant (after auth and de-duplication). */
  onCloverEvent?(e: CloverEvent): Promise<void>;
  /** A Food Hub / other suite app event (after signature check and de-duplication). */
  onSuiteEvent?(e: SuiteEvent): Promise<void>;
  /** The merchant just connected (install or first open): one-time setup such as a custom tender. */
  onConnect?(merchantId: string): Promise<void>;
  /** Called by /api/cron (every few minutes from Coolify's scheduler). */
  tick?(): Promise<Record<string, unknown> | void>;
}
