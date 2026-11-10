export function Logo() {
  return (
    <a className="logo" href="/" aria-label="Anytill home">
      <svg viewBox="0 0 26 26" aria-hidden="true">
        <rect width="26" height="26" rx="7" fill="#0A2540" />
        <path d="M6 18.5 13 6l7 12.5" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M9.2 14.2h7.6" stroke="#0F9D7A" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
      Anytill
    </a>
  );
}

export const CHAIN_MARKS = [
  ["Ethereum", "#627EEA"],
  ["Base", "#0052FF"],
  ["Arbitrum", "#28A0F0"],
  ["Solana", "#14F195"],
  ["Bitcoin", "#F7931A"],
  ["NEAR", "#00C08B"],
] as const;
