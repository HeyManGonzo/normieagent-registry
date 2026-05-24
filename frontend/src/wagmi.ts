import { createConfig, http, type Config } from "wagmi";
import { mainnet } from "wagmi/chains";
import { injected } from "wagmi/connectors";

/**
 * Minimal wagmi setup. Mainnet only (Normies live on mainnet) and only
 * injected wallets — the `injected` connector handles MetaMask, Rabby,
 * Brave, Coinbase Wallet, etc. natively. No WalletConnect dependency,
 * which keeps the bundle small and avoids the need for a Cloud project id.
 *
 * The explicit `Config` annotation suppresses TS2742 when wagmi's inferred
 * config type would reference internal symbols.
 */
export const wagmiConfig: Config = createConfig({
  chains: [mainnet],
  connectors: [injected({ shimDisconnect: true })],
  transports: {
    [mainnet.id]: http(),
  },
});
