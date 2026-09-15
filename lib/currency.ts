/**
 * Money in HelioMax is *priced* in USD and *reported* in EGP.
 *
 * Every stored amount is USD: `price_list.price_usd`, `products.price`,
 * `boq_items.unit_price`, `boqs.grand_total` (the sum of those items) and
 * `leads.deal_value` (its input is labelled USD). The one exception is
 * `sales_targets.target_value` for revenue targets, which Reports already
 * renders as EGP.
 *
 * Internal screens — dashboards, command center, CRM — read in EGP, so they
 * convert at display time. The pricing surface stays in USD end to end: the
 * BOQ editor, its summary, the product catalog, the price-list manager and the
 * customer-facing quote PDF. Nothing stored is converted, so the rate only
 * ever affects what a number looks like, never what it is.
 */

/**
 * Fallback rate for amounts with no rate of their own (a lead's deal value, a
 * product price). `boqs.exchange_rate` carries the per-quote rate and wins
 * wherever it is available, so this is only the floor.
 *
 * Override per environment with NEXT_PUBLIC_USD_TO_EGP rather than editing
 * this file. The 50.5 default is the one `boqs.exchange_rate` was created
 * with in March 2026 and is almost certainly stale.
 */
export const DEFAULT_USD_TO_EGP = Number(process.env.NEXT_PUBLIC_USD_TO_EGP) || 50.5;

/** Resolve the rate to use: a row's own rate when it has one, else the default. */
export function rateFor(rowRate?: number | null): number {
  const rate = Number(rowRate);
  return Number.isFinite(rate) && rate > 0 ? rate : DEFAULT_USD_TO_EGP;
}

/** Convert a stored USD amount to EGP. */
export function usdToEgp(usd: number, rowRate?: number | null): number {
  return (Number(usd) || 0) * rateFor(rowRate);
}

const EGP_FORMAT = new Intl.NumberFormat('en-EG', {
  style: 'currency',
  currency: 'EGP',
  maximumFractionDigits: 0,
});

const USD_FORMAT = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

/** Format a stored USD amount as EGP — the default for internal screens. */
export function formatEGP(usd: number, rowRate?: number | null): string {
  return EGP_FORMAT.format(Math.round(usdToEgp(usd, rowRate)));
}

/**
 * Format an amount that is *already* in EGP — for a total summed per row at
 * each row's own rate, which must not be converted a second time.
 */
export function formatEgpAmount(egp: number): string {
  return EGP_FORMAT.format(Math.round(Number(egp) || 0));
}

/** Format a USD amount as USD — for the pricing surface, and as a secondary read. */
export function formatUSD(usd: number): string {
  return USD_FORMAT.format(Number(usd) || 0);
}
