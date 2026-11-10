import { CHAINS, PAY_ASSETS } from "../lib/assets";
import { json } from "../lib/http.server";

export const loader = () =>
  json({ assets: PAY_ASSETS.map((a) => ({ ...a, chainName: CHAINS[a.chain].name, color: CHAINS[a.chain].color, addressHint: CHAINS[a.chain].addressHint, evmChainId: CHAINS[a.chain].evmChainId ?? null })) });
