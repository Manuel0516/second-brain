# Investments Module — Deep Dive
*(sub-module of Finance — same `tax_relevant` reporting pipeline, distinct data model)*

## 1. Why this is its own sub-module, not just more `Transaction` rows

A bot doing dozens of small swaps a day produces volume that doesn't belong mixed into your
day-to-day expense ledger — but it absolutely needs to be captured accurately, because in
most tax regimes (Sweden included) **every crypto-to-crypto swap is a taxable disposal
event**, not just cashing out to fiat. The bot isn't "moving money around tax-free" — each
trade it makes is its own capital gain/loss calculation. So: raw activity gets ingested at
full volume automatically, but the *only* thing that surfaces in your daily second-brain view
is a rolled-up summary — the detail exists for correctness, not for browsing.

## 2. Data Model

```
InvestmentAccount
  id, name ("Bitget", "Stock broker"), type: "crypto_exchange" | "brokerage"
  provider: "bitget" | ...
  api_key_ref      string | null   # encrypted reference, read-only API key
  sync_enabled     bool
  last_synced_at   timestamptz

Asset
  id, symbol ("BTC","ETH","AAPL"), asset_class: "crypto" | "stock", name

InvestmentTransaction
  id, account_id FK, asset_id FK
  type: "buy" | "sell" | "deposit" | "withdrawal" | "staking_reward" |
        "bot_trade" | "fee" | "dividend"
  quantity, price_per_unit, amount, currency
  fee_amount, fee_currency
  date
  external_id      string          # Bitget's own trade/order id — sync dedupe key
  source: "bitget_sync" | "manual" | "csv_import"
  bot_label        string | null   # which bot/strategy, if Bitget exposes it — for your own visibility, not tax-relevant by itself
  raw_payload       jsonb          # original API response, kept for audit if a number is ever questioned

RealizedGain        # computed, never user-entered
  id, sell_transaction_id FK
  asset_id, quantity, cost_basis, proceeds, gain_loss, date, tax_year
  method: "average_cost"   # see §4
```

## 3. Bitget Sync

Bitget's v2 API gives you exactly the categories needed, without reconstructing anything
from raw chain data:
- **Spot trade history** (`/api/v2/spot/trade/history-orders`, `/fills`) — every buy/sell,
  including bot-generated trades.
- **Transfer/deposit-withdrawal records** — money/crypto moving in and out of the account.
- **Earn (staking) endpoints** — staking subscriptions and reward payouts, with their own
  PnL/asset-analysis data.
- **Bot/copy-trading history** — if you're using Bitget's own bot products rather than an
  external one, their trade history shows up tagged as such.

Sync job (scheduled, e.g. every few hours): pulls each category since `last_synced_at`,
upserts by `external_id` (dedupe), stores `raw_payload` verbatim. A read-only API key is
sufficient — never request trade/withdrawal permissions for a key that only needs to report
on history.

## 4. Tax Treatment — worth getting right, and worth confirming with an accountant

A few things I'd flag rather than assume, since this is exactly the kind of detail that's
easy to get subtly wrong at volume:

- **Cost basis method**: Swedish individual taxation (Skatteverket) requires the
  **average cost method** for shares and crypto, not FIFO — every unit of a given asset
  shares one blended cost basis, recalculated as you buy more. This is *different* from how
  most US-centric tax tools default (FIFO), so if you ever look at an off-the-shelf crypto
  tax tool, check which method it's actually using. Worth a quick confirmation with your
  accountant since rules can shift year to year — `RealizedGain.method` is stored explicitly
  per record so you're never guessing later which method produced a given number.
- **Staking rewards are income at receipt**, valued at fair market value the moment they
  land — *then* that value becomes the new cost basis for whatever you do with them next.
  Two separate taxable moments, not one.
- **Crypto-to-crypto swaps are disposals.** A bot swapping BTC→ETH→USDT→BTC across a day
  isn't tax-neutral internal shuffling — each leg is a disposal of one asset and an
  acquisition of another. This is precisely why the raw transaction volume needs to be
  captured completely even though you'll never want to look at it line-by-line.

## 5. What Actually Surfaces Day-to-Day

- **Holdings view**: current positions across both accounts, unrealized P&L, derived from
  the transaction log rather than stored separately (avoids drift).
- **Realized Gains report**, by tax year — the actual number you take to your tax filing
  (Swedish K4-equivalent categories), generated the same way the Finance tax export works.
- **Raw transaction log**: filterable/paginated, exists for audit, not pushed into your
  notes/calendar feed — a bot doing 40 trades a day has no business showing up as 40 events
  in your "second brain."

## 6. Stocks (lighter weight than crypto)

Lower volume, no bot activity — likely fine with either a broker API (if your broker
exposes one) or periodic CSV import using the same `InvestmentTransaction` shape
(`source: "csv_import"`). Same `RealizedGain` computation applies, same average-cost rule
under Swedish law.

## 7. Futures

Futures need their own model — a position isn't a single disposal event like a spot trade,
it's an open exposure that accrues funding costs and fees over its lifetime until closed.

```
FuturesPosition
  id, account_id FK, asset_id FK         # underlying contract, e.g. BTCUSDT perpetual
  contract_type    "perpetual" | "dated"
  side             "long" | "short"
  leverage         decimal
  margin_mode      "isolated" | "cross"
  opened_at, closed_at (nullable while open)
  entry_price_avg, exit_price_avg (nullable while open)
  size
  initial_margin
  status           "open" | "closed" | "liquidated"
  realized_pnl     decimal | null         # only set once closed
  total_funding    decimal                # running signed sum: negative = paid, positive = received
  total_fees       decimal

FuturesTransaction       # raw event log feeding the position above — same high-volume,
                          # roll-up-don't-browse treatment as bot spot trades
  id, account_id, position_id FK
  type      "open" | "increase" | "decrease" | "close" | "funding" | "liquidation"
  price, size, fee, funding_amount
  date, external_id, source, raw_payload
```

**Why funding payments matter here specifically**: perpetual futures charge/pay funding
roughly every 8 hours. Individually they're noise; over a position's lifetime they can
meaningfully change whether it was actually profitable. They're captured at full granularity
(for correctness) but rolled into `total_funding` on the position and surfaced as one number
("funding cost this month"), same philosophy as bot trades.

**Bitget's Mix (futures) API** covers this — account/position endpoints, funding rate data,
and historical position queries. One real constraint worth designing around now: **Bitget's
position-history endpoint only retains 3 months of data**. If the sync job ever lapses for
longer than that, historical futures data is gone for good, unlike spot trade history which
seems to have a longer or no such window. Practical implication: the futures sync should run
at least weekly (daily is safer), and our own database becomes the permanent record —
Bitget's API should be treated as a temporary feed, not an archive.

**Tax treatment — flagging real uncertainty rather than guessing.** Spot/crypto disposals and
leveraged derivative instruments are not guaranteed to be taxed under the same rules in
Sweden — loss offset ("kvittning") treatment for derivatives/CFD-style instruments has
historically had its own, stricter rules compared to straightforward capital asset disposals.
I'm not confident enough in the specifics to encode a rule here, and getting this wrong in
either direction (over- or under-reporting losses) has real cost. Concretely: `RealizedGain`
rows generated from a `FuturesPosition` close get tagged with a distinct
`instrument_type: "derivative"` so they're never silently merged with spot capital gains in
a report — keeping them separable now means an accountant can apply the correct rule later
without us having baked in a guess.

**Holdings view update**: open futures positions show separately from spot holdings, with
unrealized PnL computed against the current mark price — visually distinguished given the
leverage risk profile is fundamentally different from holding spot assets outright.
