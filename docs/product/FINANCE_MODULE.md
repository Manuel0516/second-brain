# Finance Module — Deep Dive

> Implementation note: the original lightweight transaction/income-source design below is the
> Phase 3 product baseline. The expanded implementation blueprint in
> `docs/work/plans/second-brain-finance-module/` supersedes its storage model for imports,
> investment events, evidence, revisions, postings, reconciliation, Sweden/Spain tax profiles
> and report snapshots. Manual income/expense entry and the summary/ledger views described here
> remain supported as projections of that canonical finance event model; do not build a parallel
> `Transaction` table that bypasses lineage.

## 1. Core Entities

```
IncomeSource
  id            UUID
  name          string            # "Main job — Studio X", "Freelance — Acme Corp"
  type          "salary" | "freelance" | "other"
  default_amount  decimal | null  # set for stable salary, null for variable freelance
  currency        string          # ISO 4217, e.g. "SEK", "EUR"
  recurrence      rrule | null    # salary: "FREQ=MONTHLY;BYMONTHDAY=25"
  tax_category    string | null
  notes           text | null

Transaction
  id              UUID
  date            date
  amount           decimal         # always positive; sign comes from `type`
  currency         string
  amount_home_currency  decimal    # converted at transaction date, for aggregate reporting
  fx_rate          decimal | null  # snapshot rate used for the conversion above
  type             "income" | "expense"
  category         string          # "Housing","Food","Transport","Subscriptions","Equipment",...
  income_source_id FK -> IncomeSource | null
  counterparty     string | null    # merchant / client / payer name
  payment_method   "card" | "cash" | "transfer" | "other"
  status           "draft" | "sent" | "paid" | "overdue" | null   # relevant for freelance invoices
  tax_relevant     bool default false
  tax_category     string | null    # configurable — your accountant's taxonomy, not hardcoded
  recurring        bool default false
  rrule            string | null    # for recurring bills/subscriptions, same mechanism as Calendar
  notes            jsonb | null     # block content, same engine as Notes/Calendar (§5 of Notes doc)
  created_at, updated_at

Attachment   (already defined in the architecture doc — reused here)
  id, file_path (MinIO), mime_type
  → linked to a Transaction via the generic `Link` table (relation: "documents")
```

Why `amount` + `type` instead of a signed amount: makes every report (sum of income, sum of
expense, net) a trivial filter rather than sign-juggling, and avoids a whole category of bugs
where someone enters an expense as positive by mistake.

## 2. Recurring Transactions (same mechanism as Calendar recurrence)

Subscriptions and the stable salary reuse the exact recurrence approach from the Calendar
module (§2 of `CALENDAR_MODULE.md`) rather than inventing a second system:

- A **master transaction template** stores the `rrule` (e.g. monthly rent, monthly salary,
  annual software subscription).
- On the date it's due, a finance maintenance operation may **materialize an actual canonical
  event revision** — so the ledger reflects reality, not just a projection. The first slice may
  expose due items synchronously; recurring background materialization must be idempotent and is
  added only when the repository has a measured need for a worker/scheduler.
- Materializing a due bill **also creates a `CalendarEvent`** on the "Finance Deadlines"
  calendar (`created_by: system:finance`, per §7 of the Calendar doc) — this is exactly the
  "Invoice due — Studio X" event you already saw in the mockup, generated automatically
  rather than entered twice.
- Editing a single occurrence (e.g. one month's variable electricity bill) works the same as
  a calendar exception: an override row, not a change to the template.

## 3. Freelance / Job Invoicing Flow

This is the part that most directly answers "extra jobs, variable expenses, paperwork for
taxes":

1. Each job/client is an `IncomeSource`.
2. When you do work for them, you create a `Transaction` (`type: income`, `status: draft`),
   attach the invoice document once it's sent (`status: sent`), and the due date
   auto-generates a Finance Deadlines calendar event.
3. When paid, flip `status: paid` — and if it's overdue past the due date, a scheduled job
   flips it to `overdue` automatically and could (later) ping you.
4. **The invoice/contract document lives attached to the transaction from day one** — by the
   time tax season arrives, nothing needs to be hunted down.

## 4. Tax Export

Since `tax_category` is free-form (not hardcoded — your own accountant's taxonomy, or
whatever Skatteverket/freelance-client-country categories you actually need), the export is
just a query:

```
GET /finance/tax-report?year=2026
→ groups all `tax_relevant=true` transactions for the year by `tax_category`
→ returns: CSV summary (date, amount, category, counterparty)
→ plus: a zip of every attached document for those transactions
```

This is the single feature that turns "I have receipts scattered across emails and photos"
into "here's the folder for my accountant."

## 5. Views (Finance module UI with reusable Database patterns)

The expanded Finance page is a dedicated module UI. It may reuse the Notes Database table/board
interaction patterns for a simple ledger projection, but canonical events, review groups,
evidence, reconciliation and reports require Finance-specific screens. The following views remain
useful without making the Notes Database the source of truth:
- **Table view** — the full ledger, filterable/sortable.
- **Board view** — grouped by `status` (handy for tracking outstanding invoices: Draft → Sent
  → Paid).
- **Calendar view** — due dates, which is the same data already feeding the Finance Deadlines
  calendar.

## 6. Dashboard / Summary Endpoint

```
GET /finance/summary?period=month|year&date=2026-06
→ { total_income, total_expense, net, by_category: [...], by_income_source: [...] }
```
Powers a simple "how's this month looking" view — worth having even before any charts exist,
since the raw numbers alone answer most of the day-to-day question.

## 8. Multi-Account & Multi-Jurisdiction Banking

Your situation — Swedish bank + university income reported in Sweden, Spanish account
handling crypto/investment/stable income reported in Spain, plus savings accounts and
Revolut in the mix — needs two things the model above doesn't yet have: a notion of *which
bank account* money actually lands in, and *which country's tax report* that implies.

```
BankAccount
  id, name             # "Handelsbanken — Checking", "Revolut — EUR", "Spanish account"
  institution          # "Handelsbanken", "Revolut", "Santander", ...
  country, currency
  account_type         "checking" | "savings" | "fixed_deposit" | "other"
  tax_jurisdiction      "SE" | "ES"      # the default-deciding field
  sync_provider         "gocardless_bank_data" | "manual" | "csv_import"
  external_account_id   string | null
  last_synced_at

BankTransaction          # raw synced feed — separate from the categorized `Transaction`
  id, bank_account_id FK
  date, amount, currency, counterparty, description
  external_id            # aggregator's transaction id, dedupe key
  matched_transaction_id FK -> Transaction | null   # set once reviewed/categorized
  needs_review            bool default true

BalanceSnapshot           # for savings accounts where the balance matters more than line items
  id, bank_account_id FK, date, balance, currency
```

**Why a separate `BankTransaction` from `Transaction`**: the bank sync tells you reliably
*that* money moved, but not what it actually was for — and your core goal (clean
tax-ready categorization) benefits from that being a deliberate step, not an auto-guess.
`BankTransaction` is the raw inbox; reviewing one creates or links a properly categorized
`Transaction` (category, tax flags, document attachment if relevant) and the two stay
connected via `matched_transaction_id`.

### Tax jurisdiction — solving the double report

`Transaction.tax_jurisdiction` **defaults from its `BankAccount`'s jurisdiction**, with
manual override available for genuine edge cases (e.g. university income that should always
be Swedish regardless of which account briefly held it). This means the split you described
— Sweden gets Swedish-account + university income, Spain gets crypto/investment/stable income
— happens automatically as a side effect of which account things land in, rather than being
something you re-tag by hand every time.

The tax report endpoint becomes jurisdiction-scoped:
```
GET /finance/tax-report?year=2026&jurisdiction=SE
GET /finance/tax-report?year=2026&jurisdiction=ES
```
Two genuinely separate exports — never merged, never double-counted, each only pulling
`tax_relevant=true` transactions whose jurisdiction matches.

### Syncing Handelsbanken & Revolut

Neither bank exposes itself as a casual personal-project integration directly — both require
either becoming a registered, regulated Third-Party Provider (real licensing overhead, not
realistic here) or going through an **Open Banking aggregator** that already holds that
license. Both Handelsbanken and Revolut are supported by the same aggregators (Tink,
TrueLayer, Salt Edge, **GoCardless Bank Account Data**), so one integration covers both —
worth checking GoCardless's current free-tier terms specifically, since it's historically
been the most personal-project-friendly option, but pricing/limits can change.

### Net Worth — the payoff of tying this together

With bank balances (via `BalanceSnapshot`), investment holdings (`InvestmentTransaction`),
and open futures positions all in one place, a unified **Net Worth** view becomes a natural
addition: total across every account/holding, converted to home currency, trended over time
— genuinely the kind of "see my whole life as a total" view this project is for.

## 9. Manual Import — a first-class alternative to linking an account

`sync_provider` already allowed `"manual" | "csv_import"` per account, but that deserves a
real design, not just an enum value — especially since you'd rather not hand banking
credentials to a third-party aggregator for every account, and some products (savings
accounts, certain statements) might not be covered by one anyway. This applies the same way
to bank accounts *and* the investment CSV import mentioned in `INVESTMENTS_MODULE.md` §6 —
one importer, reused, not two.

### Why CSV mapping needs a template system
Every bank's export is shaped differently — column order, date format, whether debit/credit
are separate columns or one signed amount, decimal comma vs. point. Asking you to manually
map columns on *every* import would be tedious, so:

```
ImportTemplate
  id, institution            # "Handelsbanken", "Revolut", "Spanish bank"
  header_fingerprint         # hash of the column headers, for auto-detection on future uploads
  column_mapping  jsonb      # { date: "Bokföringsdag", amount: "Belopp", description: "Text", ... }
  date_format, decimal_separator, encoding
```

**First import from a given bank**: upload the file, map the columns once in a simple form
(dropdown per field), save as a template. **Every subsequent import** from that same
institution: the header fingerprint matches automatically, and it's just "upload file."

### Format support, in order of preference
1. **OFX/QFX** — if your bank offers this export option, prefer it: structured, far less
   ambiguous than CSV, no template needed.
2. **CSV** — the realistic default for most personal banking exports; handled via
   `ImportTemplate` above.
3. **PDF statement** — last resort only (text extraction is inherently less reliable for
   precise reconciliation); worth avoiding as a primary path.

### Deduplication without a stable transaction ID
Aggregator syncs get a stable `external_id` from the API. Manual CSV exports usually don't.
So imports dedupe via a **content fingerprint** (hash of date + amount + counterparty +
description) — re-uploading a file with overlapping date ranges (common, since most bank
exports default to "this month" or similar) just skips rows already present rather than
duplicating them. Import returns a summary: *"24 new, 6 already imported."*

### Same review pipeline either way
Whether a `BankTransaction` arrived via aggregator sync or manual CSV import, it lands in the
same `needs_review` queue (§8) and gets categorized/tax-tagged/document-attached the same
way. The import method is just how the row got there — everything downstream (categorization,
tax export, net worth) doesn't know or care which path was used.

## 10. Edge Cases Worth Deciding Now

1. **Multi-currency — confirmed: yes, you have/expect foreign-currency income.** This means
   `amount_home_currency` + `fx_rate` aren't optional fields, they're load-bearing from day
   one. Practical details to lock in:
   - **Home currency** is a single setting (likely SEK, given Lund) stored once, not
     per-transaction — everything converts *to* it for reporting.
   - **FX rate source**: a free daily-rate API (e.g. exchangerate.host or the ECB's published
     rates) fetched once per day and cached, rather than hitting a live API per transaction.
   - **Snapshot timing**: the rate is captured at the transaction's `date`, not at the moment
     you happen to enter it — so back-dating an invoice you forgot to log still converts using
     the correct historical rate.
   - **Display**: the ledger always shows the original currency + amount as entered (so an
     invoice in EUR still reads "€450"), with the home-currency equivalent as a secondary
     figure — never silently converting away the number your client actually agreed to.
2. **Partial payments** — an invoice paid in two installments isn't modeled yet (current
   design assumes one transaction = one payment). Flag as a Phase 3.x addition
   (`Payment` sub-entity) if/when it actually comes up, rather than building it speculatively.
3. **Recurring edits** — same "this / this and following / all" scope as Calendar recurrence.
