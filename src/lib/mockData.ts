import { RoundNumber, Stock, Transaction, VideoItem } from "@/types/sandbox";

export const INITIAL_CASH = 100000;

/** Authoritative round duration used by the mock engine's timer. */
export const ROUND_DURATION_SECONDS: Record<RoundNumber, number> = {
  1: 15 * 60, // Portfolio Building
  2: 15 * 60, // Newspaper Trading
  3: 15 * 60, // Video Trading
};

export const INITIAL_STOCKS: Stock[] = [
  {
    id: "stk-1",
    symbol: "REL",
    name: "Reliance Industries",
    currentPricePaise: 284000,
    currentPrice: 2840,
    quoteAvailable: true,
    sector: "Energy & Conglomerate",
    previousPrice: 2750,
    change: 90,
    changePercent: 3.27,
    high: 2890,
    low: 2740,
    volume: 142500,
  },
  {
    id: "stk-2",
    symbol: "TCS",
    name: "Tata Consultancy Services",
    currentPricePaise: 321000,
    currentPrice: 3210,
    quoteAvailable: true,
    sector: "Technology",
    previousPrice: 3255,
    change: -45,
    changePercent: -1.38,
    high: 3280,
    low: 3190,
    volume: 89400,
  },
  {
    id: "stk-3",
    symbol: "INFY",
    name: "Infosys Ltd",
    currentPricePaise: 192000,
    currentPrice: 1920,
    quoteAvailable: true,
    sector: "Technology",
    previousPrice: 1880,
    change: 40,
    changePercent: 2.13,
    high: 1945,
    low: 1870,
    volume: 112000,
  },
  {
    id: "stk-4",
    symbol: "HDFC",
    name: "HDFC Bank",
    currentPricePaise: 163000,
    currentPrice: 1630,
    quoteAvailable: true,
    sector: "Financial Services",
    previousPrice: 1643,
    change: -13,
    changePercent: -0.79,
    high: 1655,
    low: 1620,
    volume: 204000,
  },
  {
    id: "stk-5",
    symbol: "TATAMOTORS",
    name: "Tata Motors",
    currentPricePaise: 98000,
    currentPrice: 980,
    quoteAvailable: true,
    sector: "Automobile",
    previousPrice: 940,
    change: 40,
    changePercent: 4.25,
    high: 995,
    low: 935,
    volume: 310000,
  },
  {
    id: "stk-6",
    symbol: "ICICIBANK",
    name: "ICICI Bank",
    currentPricePaise: 112000,
    currentPrice: 1120,
    quoteAvailable: true,
    sector: "Financial Services",
    previousPrice: 1105,
    change: 15,
    changePercent: 1.36,
    high: 1132,
    low: 1100,
    volume: 165000,
  },
  {
    id: "stk-7",
    symbol: "ADANIENT",
    name: "Adani Enterprises",
    currentPricePaise: 314000,
    currentPrice: 3140,
    quoteAvailable: true,
    sector: "Infrastructure",
    previousPrice: 3020,
    change: 120,
    changePercent: 3.97,
    high: 3190,
    low: 3000,
    volume: 98000,
  },
  {
    id: "stk-8",
    symbol: "BHARTIARTL",
    name: "Bharti Airtel",
    currentPricePaise: 145000,
    currentPrice: 1450,
    quoteAvailable: true,
    sector: "Telecom",
    previousPrice: 1465,
    change: -15,
    changePercent: -1.02,
    high: 1475,
    low: 1440,
    volume: 77000,
  },
];

/** Opening position of a seeded team. */
export interface MockHoldingSeed {
  stockId: string;
  quantity: number;
  averageBuyPrice: number;
}

/** Seed team for the mock competition engine. */
export interface MockTeamSeed {
  id: string;
  name: string;
  cash: number;
  holdings: MockHoldingSeed[];
  transactions?: Transaction[];
}

/**
 * Opening state of every simulated team. The leaderboard is derived from these
 * positions × live market prices — never stored as static rankings.
 */
export const INITIAL_TEAMS: MockTeamSeed[] = [
  {
    id: "team-alpha",
    name: "Alpha Capital",
    cash: 42300,
    holdings: [
      { stockId: "stk-1", quantity: 25, averageBuyPrice: 2450 },
      { stockId: "stk-2", quantity: 10, averageBuyPrice: 3210 },
    ],
  },
  {
    id: "team-nexus",
    name: "Nexus Traders",
    cash: 42500,
    holdings: [
      { stockId: "stk-1", quantity: 20, averageBuyPrice: 2450 },
      { stockId: "stk-3", quantity: 10, averageBuyPrice: 1912 },
    ],
    transactions: [
      {
        id: "tx-seed-3",
        timestamp: "10:12:08",
        symbol: "TCS",
        companyName: "Tata Consultancy Services",
        type: "SELL",
        quantity: 10,
        price: 3200,
        total: 32000,
      },
      {
        id: "tx-seed-2",
        timestamp: "10:10:04",
        symbol: "INFY",
        companyName: "Infosys Ltd",
        type: "BUY",
        quantity: 10,
        price: 1912,
        total: 19120,
      },
      {
        id: "tx-seed-1",
        timestamp: "10:06:31",
        symbol: "REL",
        companyName: "Reliance Industries",
        type: "BUY",
        quantity: 20,
        price: 2450,
        total: 49000,
      },
    ],
  },
  {
    id: "team-sigma",
    name: "Sigma Quant",
    cash: 48900,
    holdings: [
      { stockId: "stk-2", quantity: 12, averageBuyPrice: 3210 },
      { stockId: "stk-6", quantity: 15, averageBuyPrice: 1105 },
    ],
  },
  {
    id: "team-phoenix",
    name: "Phoenix Ventures",
    cash: 42000,
    holdings: [
      { stockId: "stk-4", quantity: 20, averageBuyPrice: 1630 },
      { stockId: "stk-8", quantity: 15, averageBuyPrice: 1465 },
      { stockId: "stk-6", quantity: 10, averageBuyPrice: 1105 },
    ],
  },
  {
    id: "team-nova",
    name: "Nova Arbitrage",
    cash: 41000,
    holdings: [
      { stockId: "stk-1", quantity: 15, averageBuyPrice: 2450 },
      { stockId: "stk-3", quantity: 12, averageBuyPrice: 1880 },
    ],
  },
  {
    id: "team-zenith",
    name: "Zenith Holdings",
    cash: 88000,
    holdings: [{ stockId: "stk-7", quantity: 5, averageBuyPrice: 3020 }],
  },
];

/** The team a locally signed-in participant controls in this simulation. */
export const DEFAULT_TEAM_ID = "team-nexus";

export const PRESET_VIDEOS: VideoItem[] = [
  {
    id: "vid-1",
    title: "Market Shock --- Global Interest Rate Surge",
    description: "Central reserve hikes interest rates unexpectedly by 75 bps causing volatility in financial and tech stocks.",
    url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
    durationSeconds: 15,
    roundRequirement: 3,
  },
  {
    id: "vid-2",
    title: "Economic Boom --- Renewable Energy Breakthrough",
    description: "Government announces massive ₹50,000 Cr green energy infrastructure subsidy package.",
    url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
    durationSeconds: 15,
    roundRequirement: 3,
  },
  {
    id: "vid-3",
    title: "Quarterly Earnings Flash --- Tech Rally",
    description: "Leading tech firms exceed revenue targets by 18%, sparking momentum across enterprise IT.",
    url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4",
    durationSeconds: 15,
    roundRequirement: 3,
  },
];
