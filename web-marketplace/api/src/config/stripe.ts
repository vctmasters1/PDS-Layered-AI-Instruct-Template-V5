import Stripe from "stripe";

/**
 * Shared Stripe client singleton.
 * Validates the secret key is present in production — fails fast instead of
 * silently passing an empty string and getting cryptic API errors later.
 */
const STRIPE_SECRET_KEY = (() => {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key && process.env.NODE_ENV === "production") {
    throw new Error("FATAL: STRIPE_SECRET_KEY environment variable is not set in production");
  }
  return key || "";
})();

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: "2024-12-18.acacia" as any,
});

export default stripe;
