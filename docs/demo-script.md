# Anytill demo video: script (1 min 55 s)

Record at 1280×800, browser zoom 100%, `yarn demo` running. Narration is spoken; **Caption** is the on-screen text (burn in, bottom-left, Hanken Grotesk 600, navy on white). Keep the cursor slow. No music under the narration.

| Time | Screen | Narration | Caption |
|---|---|---|---|
| 0:00–0:08 | Landing page, top. Scroll slowly so the right-hand card moves from "choose" to "quote" | "Shopify stores can't take crypto from any chain without a custodian. Anytill fixes that." | Take crypto from any chain. Get USDC. |
| 0:08–0:18 | Keep scrolling to "Verified"; the card shows Paid | "The buyer pays with whatever they hold. The store gets the exact order total in USDC, on NEAR, through NEAR Intents." | Exact USDC to the merchant via NEAR Intents 1Click |
| 0:18–0:30 | `/demo`. Click **Buy with crypto** on the Weekender bag ($48) | "This is a demo store. The price comes from Shopify's order on the server, never from the browser." | Demo store · amount read server-side |
| 0:30–0:45 | Pick **SOL**, paste a Solana refund address, **Continue** | "I pick SOL. Anytill asks 1Click for an exact-output quote: send this much SOL, the merchant receives exactly 48 USDC." | Live 1Click EXACT_OUTPUT quote · demo address, no funds |
| 0:45–1:00 | Click **Simulate the deposit**; steps tick; then "Paid · Settled in N s" | "In demo mode the deposit is simulated. Watch the money states: pending, settled, paid out, each with a time." | Pending → Settled → Paid out |
| 1:00–1:12 | Expand **8 of 8 server-side checks passed** | "Before the order is marked paid, the server checks the swap against the quote it issued, then reads the USDC transfer on NEAR itself." | Marked paid only after 8 checks, incl. the NEAR receipt |
| 1:12–1:27 | Click **View receipt** | "Every payment gets a shareable receipt: what the buyer paid, what the store got, and the spread against CoinGecko's mid-market price." | Receipt · spread in bps vs a named price source |
| 1:27–1:37 | `/app` admin: payments table with Money state and Receipt | "The merchant sees the same in the Shopify admin, sets per-order and daily caps, and can refund in crypto." | Polaris admin · caps · crypto refunds |
| 1:37–1:47 | Terminal: `yarn test`, scroll to "Try to break it: 13 of 13 attacks refused" | "We attacked it: forged deposits, replayed quotes, redirected payouts, fake tokens, price tampering. Thirteen of thirteen refused." | Try to break it: 13 of 13 refused |
| 1:47–1:55 | Back to the landing hero | "Anytill. One Shopify app, or one script tag. Open source, built at NEAR HACKATHON." | Built at NEAR HACKATHON · @NEARProtocol #NEARHackathon |

**Say on screen or in the post, not as a claim in the video:** the deposit and payout in this demo are simulated; no real orders have been paid yet.
