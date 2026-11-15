import { fetch } from 'expo/fetch';

type FetchResponse = Awaited<ReturnType<typeof fetch>>;

/**
 * Client for the Garmin Connect Personal API, which gives an individual access to their own data.
 * Docs: https://developer.garmin.com/gc-developer-program/personal/
 * Reference client: https://github.com/garmin/connect-personal-api-python
 */
const BASE_URL = 'https://personal.connectapi.garmin.com';
const TOKEN_PATH = '/personalapitoken-service/personal-api/personal-api-key/token';

/** Where the user creates the Personal API key on Garmin Connect. */
export const PERSONAL_API_KEY_URL = 'https://connect.garmin.com/app/settings/personalApiToken';

/** Access tokens last 24 hours and cannot be refreshed; renew one an hour early, like Garmin's client. */
const RENEW_BEFORE_EXPIRY_MS = 60 * 60 * 1000;
const FALLBACK_TOKEN_LIFETIME_MS = 23 * 60 * 60 * 1000;

/** A Garmin API failure whose message is safe to show to the user. */
export class GarminApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }

  /** True when retrying other requests now is pointless: bad key, throttling or no connection. */
  get blocksSync(): boolean {
    return this.status === undefined || this.status === 401 || this.status === 403
      || this.status === 429;
  }
}

/** The fields trailOS reads from Garmin's SummarizedActivityDTO. */
export interface GarminActivitySummary {
  activityId: number;
  activityName?: string;
  /** Activity start in milliseconds since the Unix epoch. */
  beginTimestamp?: number;
}

function failureMessage(status: number, request: 'token' | 'data'): string {
  if (status === 401 || status === 403) {
    return request === 'token'
      ? 'Garmin rejected the API key. It may be mistyped, expired or deleted.'
      : 'Garmin rejected the request. Reconnect with a new API key.';
  }
  if (status === 404) return 'Garmin has no activity file for this activity.';
  if (status === 429) return 'Garmin is limiting requests right now. Try again later.';
  if (status >= 500) return 'Garmin Connect is unavailable right now. Try again later.';
  return `Garmin returned an unexpected error (HTTP ${status}).`;
}

async function send(url: string, method: 'GET' | 'POST', headers: Record<string, string>) {
  try {
    return await fetch(url, { method, headers });
  } catch {
    throw new GarminApiError('Could not reach Garmin Connect. Check your internet connection.');
  }
}

/** Reads the `exp` claim of the access token (a JWT) without verifying it. */
function tokenExpiry(token: string, issuedAt: number): number {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const { exp } = JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, '=')));
    if (typeof exp === 'number') return exp * 1000;
  } catch {
    // Fall through to the documented 24-hour lifetime.
  }
  return issuedAt + FALLBACK_TOKEN_LIFETIME_MS;
}

export class GarminPersonalApi {
  private token: { value: string; expiresAt: number } | null = null;

  constructor(private readonly apiKey: string) {}

  /** Confirms the key works by exchanging it for a fresh access token. */
  async verify(): Promise<void> {
    await this.accessToken(true);
  }

  /** Lists activities that started on or after a local date (YYYY-MM-DD), newest first. */
  async searchActivities(startDate: string, start: number, limit: number): Promise<GarminActivitySummary[]> {
    const query = `start=${start}&limit=${limit}&startDate=${encodeURIComponent(startDate)}`;
    const response = await this.get(`/activitylist-service/activities/search/activities?${query}`, 'application/json');
    const body: unknown = await response.json();
    if (!Array.isArray(body)) throw new GarminApiError('Garmin returned an unexpected activity list.');
    return body.filter((item): item is GarminActivitySummary =>
      typeof item === 'object' && item !== null && typeof item.activityId === 'number');
  }

  /** Downloads the activity's original file, which Garmin delivers as a zip. */
  async downloadActivityFile(activityId: number): Promise<Uint8Array> {
    const response = await this.get(
      `/download-service/files/activity/${activityId}`,
      'application/zip, application/x-zip-compressed, application/octet-stream',
    );
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length === 0) throw new GarminApiError('Garmin returned an empty activity file.');
    return bytes;
  }

  private async accessToken(renew = false): Promise<string> {
    const now = Date.now();
    if (!renew && this.token && this.token.expiresAt - now > RENEW_BEFORE_EXPIRY_MS) return this.token.value;
    this.token = null;
    const response = await send(`${BASE_URL}${TOKEN_PATH}`, 'POST', {
      Accept: '*/*',
      Authorization: `ApiKey ${this.apiKey}`,
    });
    if (!response.ok) throw new GarminApiError(failureMessage(response.status, 'token'), response.status);
    const value = (await response.text()).trim();
    if (!value) throw new GarminApiError('Garmin did not return an access token.');
    this.token = { value, expiresAt: tokenExpiry(value, now) };
    return value;
  }

  private async get(path: string, accept: string): Promise<FetchResponse> {
    const request = async (renew: boolean) => send(`${BASE_URL}${path}`, 'GET', {
      Accept: accept,
      Authorization: `Bearer ${await this.accessToken(renew)}`,
    });
    let response = await request(false);
    // A token can stop working before it expires; retry once with a new one.
    if (response.status === 401) response = await request(true);
    if (!response.ok) throw new GarminApiError(failureMessage(response.status, 'data'), response.status);
    return response;
  }
}
