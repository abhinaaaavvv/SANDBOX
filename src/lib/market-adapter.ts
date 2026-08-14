/**
 * Market Data Adapter
 *
 * Maps database stock/market_quote data to the frontend Stock type.
 *
 * Key invariants:
 * - currentPricePaise is the authoritative integer value (BIGINT from DB).
 * - currentPrice is derived (currentPricePaise / 100) for display only.
 * - Stocks WITHOUT a market quote are included with quoteAvailable: false.
 * - NULL price is distinct from 0 price.
 * - Legacy fields (change, changePercent, high, low, volume, sector) are
 *   undefined when not available in the database — never fabricated.
 */

import { Stock } from "@/types/sandbox";

// ---------------------------------------------------------------------------
// Database types (matching Supabase query shape)
// ---------------------------------------------------------------------------

/** Database stock row from Supabase. */
interface DbStock {
  id: string;
  symbol: string;
  name: string;
  description: string;
  is_active: boolean;
}

/** Database market_quote row from Supabase. */
interface DbMarketQuote {
  price_paise: number | null;
  updated_at: string;
  competition_run_id: string;
}

/** Joined stock with market_quote from Supabase LEFT JOIN query. */
export interface DbStockWithQuote extends DbStock {
  market_quotes: DbMarketQuote[] | null;
}

// ---------------------------------------------------------------------------
// Adapter functions
// ---------------------------------------------------------------------------

/**
 * Convert a database stock with optional market_quote to the frontend Stock type.
 *
 * Handles three cases:
 * 1. Stock with valid quote → quoteAvailable: true, currentPricePaise set
 * 2. Stock with null price_paise → quoteAvailable: true, currentPricePaise: 0
 *    (quote exists but price is NULL — data integrity issue)
 * 3. Stock without quote → quoteAvailable: false, currentPricePaise: 0
 *
 * Legacy fields (change, changePercent, etc.) are undefined when not in DB.
 */
export function dbStockToStock(dbStock: DbStockWithQuote): Stock {
  const hasQuote =
    dbStock.market_quotes !== null && dbStock.market_quotes.length > 0;
  const quote = hasQuote ? dbStock.market_quotes![0] : null;

  // Distinguish: no quote vs NULL price vs 0 price
  let currentPricePaise: number;
  let quoteAvailable: boolean;

  if (!quote) {
    // Case 3: Stock exists but no market_quote row for this run
    currentPricePaise = 0;
    quoteAvailable = false;
  } else if (quote.price_paise === null || quote.price_paise === undefined) {
    // Case 2: Quote exists but price_paise is NULL — data integrity issue
    currentPricePaise = 0;
    quoteAvailable = false;
  } else {
    // Case 1: Valid quote with integer price_paise
    currentPricePaise = quote.price_paise;
    quoteAvailable = true;
  }

  return {
    id: dbStock.id,
    symbol: dbStock.symbol,
    name: dbStock.name,
    description: dbStock.description,
    currentPricePaise,
    // Derived display value: paise / 100 as a number. Used by formatINR().
    // Never use this for authoritative calculations.
    currentPrice: currentPricePaise / 100,
    quoteAvailable,
    // Legacy fields: undefined (not fabricated) when not in database.
    // Components must handle undefined by showing "N/A" or hiding the element.
  };
}

/**
 * Convert multiple database stocks with market_quotes to frontend Stock array.
 * Does NOT filter out stocks without quotes — they are included with
 * quoteAvailable: false so the UI can show an appropriate state.
 */
export function dbStocksToStocks(dbStocks: DbStockWithQuote[]): Stock[] {
  return dbStocks.map(dbStockToStock);
}
