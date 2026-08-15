import type { Env } from '../types';
import { jsonOk } from '../lib/http';
import { getAnalytics } from '../lib/db';

export async function handleAnalytics(env: Env): Promise<Response> {
  return jsonOk(await getAnalytics(env));
}
