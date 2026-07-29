import type { FinanceActivityItem, FinanceSummary } from './types'
import type { TrendPoint } from './primitives'

const DECIMAL_RE = /^(-?)(\d+)(?:\.(\d+))?$/

/**
 * Decimal-safe sum — scales every value to the widest fraction length seen and adds as
 * BigInt, so summing many decimal strings never accumulates float rounding error. Only the
 * final result is ever converted to a JS number (by a caller, for chart plotting).
 */
export function sumDecimal(values: Array<string | null | undefined>): string {
  let precision = 0
  for (const raw of values) {
    if (raw == null) continue
    const match = DECIMAL_RE.exec(raw.trim())
    if (!match) continue
    precision = Math.max(precision, (match[3] ?? '').length)
  }
  let total = 0n
  for (const raw of values) {
    if (raw == null) continue
    const match = DECIMAL_RE.exec(raw.trim())
    if (!match) continue
    const negative = match[1] === '-'
    const digits = BigInt(match[2] + (match[3] ?? '').padEnd(precision, '0'))
    total += negative ? -digits : digits
  }
  const negative = total < 0n
  const abs = negative ? -total : total
  const str = abs.toString().padStart(precision + 1, '0')
  const integerPart = str.slice(0, str.length - precision) || '0'
  const fractionPart = precision > 0 ? str.slice(str.length - precision) : ''
  const sign = negative && abs !== 0n ? '-' : ''
  return fractionPart
    ? `${sign}${integerPart}.${fractionPart}`
    : `${sign}${integerPart}`
}

function roundDecimalString(
  raw: string,
  precision: number,
): { negative: boolean; integer: string; fraction: string } | null {
  const match = DECIMAL_RE.exec(raw.trim())
  if (!match) return null
  const negative = match[1] === '-'
  const integer = match[2]
  const fractionRaw = match[3] ?? ''
  if (fractionRaw.length <= precision) {
    return { negative, integer, fraction: fractionRaw.padEnd(precision, '0') }
  }
  const kept = fractionRaw.slice(0, precision)
  const roundUp = fractionRaw.charCodeAt(precision) - 48 >= 5
  let combined = BigInt(integer + kept)
  if (roundUp) combined += 1n
  const combinedStr = combined.toString().padStart(precision + 1, '0')
  const newInteger = combinedStr.slice(0, combinedStr.length - precision) || '0'
  const newFraction =
    precision > 0 ? combinedStr.slice(combinedStr.length - precision) : ''
  return { negative, integer: newInteger, fraction: newFraction }
}

const CURRENCY_PART_CACHE = new Map<
  string,
  { prefix: string; suffix: string }
>()

function currencyParts(currency: string): { prefix: string; suffix: string } {
  const cached = CURRENCY_PART_CACHE.get(currency)
  if (cached) return cached
  let parts: { prefix: string; suffix: string }
  try {
    const formatted = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).formatToParts(0)
    let prefix = ''
    let suffix = ''
    let seenNumber = false
    for (const part of formatted) {
      if (['integer', 'group', 'decimal', 'fraction'].includes(part.type)) {
        seenNumber = true
        continue
      }
      if (seenNumber) suffix += part.value
      else prefix += part.value
    }
    parts = { prefix, suffix }
  } catch {
    parts = { prefix: '', suffix: ` ${currency}` }
  }
  CURRENCY_PART_CACHE.set(currency, parts)
  return parts
}

/** Formats a decimal string as money without ever routing the value through Number(). */
export function formatMoney(value: string | null, currency = 'EUR'): string {
  if (value === null) return '—'
  const rounded = roundDecimalString(value, 2)
  if (!rounded) return '—'
  const { negative, integer, fraction } = rounded
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const numberText = fraction === '00' ? grouped : `${grouped}.${fraction}`
  const { prefix, suffix } = currencyParts(currency)
  const sign = negative && !/^0+$/.test(integer + fraction) ? '-' : ''
  return `${sign}${prefix}${numberText}${suffix}`
}

export function dayLabel(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** Sum grouped activity report values per tax_date — the only genuine time series the backend exposes. */
export function aggregateByDay(items: FinanceActivityItem[]): TrendPoint[] {
  const buckets = new Map<string, (string | null)[]>()
  for (const item of items) {
    if (item.representation !== 'group') continue
    const list = buckets.get(item.tax_date) ?? []
    list.push(item.report_value)
    buckets.set(item.tax_date, list)
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, values]) => ({
      label: dayLabel(date),
      value: Number(sumDecimal(values)),
    }))
}

export function aggregateByMonth(items: FinanceActivityItem[]): TrendPoint[] {
  const buckets = new Map<string, (string | null)[]>()
  for (const item of items) {
    if (item.representation !== 'group') continue
    const month = item.tax_date.slice(0, 7)
    const list = buckets.get(month) ?? []
    list.push(item.report_value)
    buckets.set(month, list)
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([month, values]) => ({
      label: new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-US', {
        month: 'short',
      }),
      value: Number(sumDecimal(values)),
    }))
}

/** Aggregates raw (ungrouped) activity items by hour-of-day — genuine hourly detail. */
export function aggregateByHour(
  items: Extract<FinanceActivityItem, { representation: 'raw' }>[],
): TrendPoint[] {
  const buckets = new Map<string, (string | null)[]>()
  for (const item of items) {
    const bucket = item.effective_at.slice(0, 13)
    const list = buckets.get(bucket) ?? []
    list.push(item.report_value)
    buckets.set(bucket, list)
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([bucket, values]) => ({
      label: `${bucket.slice(11, 13)}:00`,
      value: Number(sumDecimal(values)),
    }))
}

/** Heuristic readiness percentage — the contract has no numeric score yet, only blocking/warning counts. */
// ponytail: derived score pending a real backend readiness metric (Wave 2A). Swap once /summary exposes one.
export function readinessPercent(summary: FinanceSummary): number {
  if (summary.readiness.status === 'ready') return 100
  const penalty =
    summary.readiness.blocking_count * 18 + summary.readiness.warning_count * 6
  return Math.max(10, 100 - penalty)
}
