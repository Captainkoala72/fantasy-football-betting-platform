import {
  bigint,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * All money is stored in integer cents to avoid floating point drift.
 * Every user starts with $10,000.00 (1_000_000 cents) of play money.
 */
export const STARTING_BALANCE_CENTS = 1_000_000;

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    username: text("username").notNull(),
    displayName: text("display_name").notNull(),
    pinHash: text("pin_hash").notNull(),
    sessionToken: text("session_token").notNull(),
    balanceCents: bigint("balance_cents", { mode: "number" }).notNull().default(STARTING_BALANCE_CENTS),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("users_username_idx").on(t.username),
    uniqueIndex("users_session_token_idx").on(t.sessionToken),
  ],
);

export const bets = pgTable(
  "bets",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** "single" | "parlay" */
    kind: text("kind").notNull(),
    /** "espn" | "demo" — which data source the bet was priced against */
    source: text("source").notNull().default("espn"),
    season: integer("season").notNull(),
    /** Matchup period the bet resolves in (max of legs) */
    week: integer("week").notNull(),
    stakeCents: bigint("stake_cents", { mode: "number" }).notNull(),
    /** Combined American odds at placement */
    americanOdds: integer("american_odds").notNull(),
    /** Combined decimal odds at placement */
    decimalOdds: numeric("decimal_odds", { precision: 12, scale: 4 }).notNull(),
    potentialPayoutCents: bigint("potential_payout_cents", { mode: "number" }).notNull(),
    /** "open" | "won" | "lost" | "push" | "void" */
    status: text("status").notNull().default("open"),
    payoutCents: bigint("payout_cents", { mode: "number" }).notNull().default(0),
    placedAt: timestamp("placed_at", { withTimezone: true }).notNull().defaultNow(),
    settledAt: timestamp("settled_at", { withTimezone: true }),
  },
  (t) => [index("bets_user_idx").on(t.userId), index("bets_status_idx").on(t.status)],
);

export const betLegs = pgTable(
  "bet_legs",
  {
    id: serial("id").primaryKey(),
    betId: integer("bet_id")
      .notNull()
      .references(() => bets.id, { onDelete: "cascade" }),
    source: text("source").notNull().default("espn"),
    season: integer("season").notNull(),
    week: integer("week").notNull(),
    matchupId: integer("matchup_id").notNull(),
    /** "moneyline" | "spread" | "total" | "team_total" */
    market: text("market").notNull(),
    /** "home" | "away" | "over" | "under" */
    selection: text("selection").notNull(),
    /** Team the selection references (for ML/spread/team totals) */
    teamId: integer("team_id"),
    line: numeric("line", { precision: 8, scale: 2 }),
    americanOdds: integer("american_odds").notNull(),
    decimalOdds: numeric("decimal_odds", { precision: 12, scale: 4 }).notNull(),
    homeTeamId: integer("home_team_id").notNull(),
    awayTeamId: integer("away_team_id").notNull(),
    homeTeamName: text("home_team_name").notNull(),
    awayTeamName: text("away_team_name").notNull(),
    /** Human readable e.g. "Kittle Corn -3.5" */
    label: text("label").notNull(),
    /** "open" | "won" | "lost" | "push" */
    status: text("status").notNull().default("open"),
    homeScore: numeric("home_score", { precision: 8, scale: 2 }),
    awayScore: numeric("away_score", { precision: 8, scale: 2 }),
    settledAt: timestamp("settled_at", { withTimezone: true }),
  },
  (t) => [index("bet_legs_bet_idx").on(t.betId), index("bet_legs_status_idx").on(t.status)],
);

export const ledger = pgTable(
  "ledger",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    betId: integer("bet_id").references(() => bets.id, { onDelete: "set null" }),
    /** "deposit" | "wager" | "payout" | "refund" */
    kind: text("kind").notNull(),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    balanceAfterCents: bigint("balance_after_cents", { mode: "number" }).notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ledger_user_idx").on(t.userId)],
);

/** Last-known-good copies of ESPN responses so the book keeps working if ESPN hiccups. */
export const espnCache = pgTable("espn_cache", {
  key: text("key").primaryKey(),
  payload: jsonb("payload").notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Small key/value store (demo-mode clock, settlement bookkeeping). */
export const appState = pgTable("app_state", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type UserRow = typeof users.$inferSelect;
export type BetRow = typeof bets.$inferSelect;
export type BetLegRow = typeof betLegs.$inferSelect;
