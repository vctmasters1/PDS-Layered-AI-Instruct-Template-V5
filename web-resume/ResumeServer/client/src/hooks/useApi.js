import { api } from '../api-client.js';

/**
 * Thin hook that exposes the api-client to components via React context pattern.
 * Prefer importing api directly from api-client.js for simple cases.
 */
export function useApi() {
  return api;
}
