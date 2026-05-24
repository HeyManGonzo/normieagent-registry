/**
 * Build-time feature flags for the frontend.
 *
 * The self-serve wallet flow (connect → sign → register) is fully implemented
 * but disabled at launch. Subdomains are added manually by the operator via
 * the admin CLI while the service is small. Flip WALLET_FLOW_ENABLED to true
 * once we want users to register themselves on-chain.
 */
export const WALLET_FLOW_ENABLED = false;

/**
 * Operator contact used in the manual-registration CTA shown while
 * WALLET_FLOW_ENABLED is false.
 */
export const OPERATOR_TWITTER_HANDLE = "heymangonzo";
export const OPERATOR_TWITTER_URL = `https://x.com/${OPERATOR_TWITTER_HANDLE}`;
