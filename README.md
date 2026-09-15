# LeagueLines — your ESPN fantasy league, priced like a sportsbook

LeagueLines pulls your private ESPN Fantasy Football league through ESPN's unofficial
v3 API, converts every team's projections into spreads, totals, moneylines and team totals,
and lets your league-mates bet on the matchups with a $10,000 play-money bankroll.

## Deploy on Vercel

1. Create a PostgreSQL database and copy its connection string.
2. In Vercel, open your project settings and add `DATABASE_URL` under
   **Environment Variables** for Production and any Preview environments you use.
   Use the connection string supplied by your database provider, including its SSL settings.
3. Locally, copy `.env.example` to `.env.local` and set `DATABASE_URL` to the database
   you intend to deploy against. Run `npm ci`, then `npx drizzle-kit push` to apply
   `src/db/schema.ts`. Review the proposed schema changes before accepting them.
4. Deploy or redeploy the project. Environment-variable changes only apply to new
   deployments. Verify `/api/health` returns a successful database check.

Database initialization is deferred until runtime, so `npm run build` can complete
without `DATABASE_URL`. A working database and the applied schema are still required
for accounts, bets, caching, and demo-week state. Demo mode replaces ESPN data; it
does not replace PostgreSQL.

See [Vercel's environment-variable documentation](https://vercel.com/docs/environment-variables).

## Connect your league

Add these environment variables (in `.env` or your host's secret manager):

| Variable | Description |
| --- | --- |
| `ESPN_LEAGUE_ID` (or `LEAGUE_ID`) | The number in your league URL: `fantasy.espn.com/football/league?leagueId=**123456**` |
| `espn_s2` (or `ESPN_S2`) | Cookie from a logged-in espn.com session |
| `SWID` | Cookie from the same session, including the `{}` braces |
| `ESPN_SEASON` | Optional. Auto-detected when omitted. |

**Getting the cookies:** log in at fantasy.espn.com → open DevTools → *Application* →
*Cookies* → `https://fantasy.espn.com` → copy the values of `espn_s2` and `SWID`.
Public leagues work with just the league ID.

Without credentials the app runs a deterministic **demo league** so you can explore the
board, place bets and use *Simulate week* to watch tickets settle.

## How odds are made

1. Each starter's ESPN weekly projection is read from the box-score feed
   (`statSourceId = 1`); actuals come from `statSourceId = 0`.
2. A team's score is modelled as Normal(μ = Σ proj, σ² = Σ σᵢ²) with position-specific
   coefficients of variation (QB 0.38 … D/ST 0.75).
3. Margin and total are therefore normal too, so moneyline, spread, total and team totals
   are priced in closed form with Φ. Lines are rounded to the half point and the exact
   cover probability sets the juice.
4. A 4.55 % multiplicative hold turns a coin-flip into −110 / −110.
5. During the week the model re-prices live: finished starters bank their points with zero
   variance, in-progress starters carry shrinking variance based on NFL kickoff times.

Full write-up in the app under **How odds work**.

## Stack

Next.js 16 (App Router) · React 19 · Tailwind CSS 4 · PostgreSQL via Drizzle ORM.
Schema lives in `src/db/schema.ts`; apply with `npx drizzle-kit push`.
