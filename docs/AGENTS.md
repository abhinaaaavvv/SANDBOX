# AGENTS.md --- SANDBOX UI & Frontend Specification

## 1. Project Overview

SANDBOX is a live stock-market simulation web application for a college
Business Club competition.

Teams compete by buying and selling virtual shares across three timed
rounds. The competition is controlled centrally by an administrator,
while each team interacts through a participant trading dashboard.

This document defines the **UI and frontend architecture only**. Backend
implementation, database design, server-side trading logic,
authentication, and API implementation are intentionally out of scope
for this document.

The frontend must feel like a serious, modern trading terminal rather
than a generic college event website.

------------------------------------------------------------------------

# 2. Core Product Concept

SANDBOX has exactly **two interfaces**:

1.  **Admin Panel**
2.  **Participant Panel**

There is no conventional login system.

The frontend should treat the backend/realtime layer as the source of
truth.

The browser must never independently decide authoritative values such
as:

-   stock prices
-   cash balance
-   holdings
-   portfolio value
-   profit/loss
-   leaderboard ranking
-   round status
-   market status

The frontend's job is to:

-   display authoritative state
-   send user actions to the backend
-   react immediately to realtime state changes
-   provide clear visual feedback
-   prevent confusing or invalid interactions at the UI level

------------------------------------------------------------------------

# 3. Competition Flow

## Round 1 --- Portfolio Building

Duration: **15 minutes**

When the admin starts Round 1:

-   Every team starts with ₹1,00,000 virtual cash.
-   The timer starts.
-   Trading opens.
-   Teams can buy and sell shares.
-   Portfolio values update as trades occur.
-   Profit/loss updates continuously.
-   Leaderboard updates as required.

When the timer reaches zero or the admin ends the round:

-   Trading stops.
-   Buy/sell controls become disabled.
-   The round state changes visually.
-   The participant dashboard remains visible so teams can inspect their
    results.

------------------------------------------------------------------------

## Round 2 --- Newspaper Trading

Duration: **15 minutes**

The organizer physically distributes newspapers.

There is **no digital news feed** in the application.

During this round:

1.  Participants continue seeing current market prices.
2.  The admin prepares price changes privately.
3.  Pending changes must NOT appear on participant screens.
4.  The admin clicks `Apply Price Changes`.
5.  New prices become visible immediately.
6.  Portfolio values, P/L, and leaderboard update.

The UI must make the distinction between:

-   **Current Market Price**
-   **Pending Admin Price**

very obvious inside the Admin Panel.

Participants must never see pending prices.

------------------------------------------------------------------------

## Round 3 --- External Video / Trading

Duration: **15 minutes**

The organizer may use external video/content during this round, but **SANDBOX does not
display, host, upload, synchronize, or control that video**.

SANDBOX only manages the competition mechanics:

1. Admin starts Round 3.
2. The server-authoritative 15-minute timer starts.
3. Participants continue trading.
4. Admin prepares price changes privately.
5. Admin clicks `Apply Price Changes`.
6. New prices become authoritative and are broadcast in realtime.
7. Portfolio values, P/L, and leaderboard update.
8. Admin can end the round, or the round expires authoritatively.

Participants never receive a video UI or video playback events from SANDBOX.


------------------------------------------------------------------------

# 4. Frontend Technology Stack

Use:

-   **Next.js**
-   **React**
-   **TypeScript**
-   **Tailwind CSS**
-   **shadcn/ui** where useful
-   **Lucide React** for icons
-   **Recharts** or an equivalent lightweight charting library for
    market/portfolio charts
-   **Supabase client** for realtime frontend subscriptions and data
    access where appropriate

Recommended rendering approach:

-   Server Components where they provide meaningful benefit.
-   Client Components for live trading state, timers, charts, forms,
    realtime events, video playback, and interactive controls.

Do not over-engineer the frontend with unnecessary state libraries.

Prefer:

-   React state
-   React context for small global UI state
-   server/realtime state from the backend
-   small focused hooks

If global state becomes necessary, introduce a lightweight store rather
than creating a large abstraction layer.

------------------------------------------------------------------------

# 5. Visual Direction

The application should look like a **premium competition trading
terminal**.

Avoid:

-   generic SaaS dashboard aesthetics
-   excessive gradients
-   childish finance illustrations
-   huge rounded cards everywhere
-   unnecessary animations
-   excessive glassmorphism
-   visually noisy backgrounds

Preferred characteristics:

-   dark-first interface
-   high information density
-   strong typography
-   clear numerical hierarchy
-   subtle borders
-   compact controls
-   restrained accent colors
-   excellent spacing
-   clear positive/negative market indicators
-   professional trading-terminal feel

Suggested visual language:

-   Background: near-black / charcoal
-   Surfaces: slightly lighter charcoal
-   Borders: subtle gray
-   Primary accent: configurable SANDBOX brand accent
-   Positive values: green
-   Negative values: red
-   Warnings: amber/yellow
-   Neutral values: white/gray

Do not hard-code a large color system into individual components.
Centralize design tokens.

------------------------------------------------------------------------

# 6. Responsive Strategy

The competition will primarily be used on laptops/desktops.

Desktop is the primary target.

Still support:

-   1280px+
-   1440px+
-   1920px+

At smaller widths:

-   collapse secondary panels
-   allow horizontal scrolling for dense tables
-   preserve critical controls
-   never make the timer or trading controls inaccessible

The admin panel should prioritize desktop usability.

The participant panel should remain usable on smaller screens but does
not need to be optimized primarily for mobile.

------------------------------------------------------------------------

# 7. Application Shell

Both interfaces should use a consistent application shell.

## Header

The header should contain:

-   SANDBOX branding
-   current round
-   market status
-   timer
-   connection/realtime status where useful
-   team name on participant interface

Example:

``` text
SANDBOX
ROUND 2                    MARKET OPEN        08:42
```

The timer should be visually prominent.

When trading is paused:

``` text
TRADING PAUSED
```

When market is closed:

``` text
MARKET CLOSED
```

When the round has ended:

``` text
ROUND COMPLETE
```

------------------------------------------------------------------------

# 8. Participant Interface

The participant dashboard is the primary trading interface.

It should expose the information teams need without forcing them to
navigate through multiple pages.

Recommended structure:

``` text
┌───────────────────────────────────────────────────────────────┐
│ SANDBOX     ROUND 2      MARKET OPEN      08:42     TEAM A    │
├───────────────────────────────────────────────────────────────┤
│                                                               │
│ CASH AVAILABLE     PORTFOLIO VALUE     TOTAL P/L             │
│ ₹42,500             ₹1,18,420           +₹18,420              │
│                                                               │
├──────────────────────────────┬────────────────────────────────┤
│ MARKET                       │ YOUR HOLDINGS                  │
│                              │                                │
│ RELIANCE   ₹2,840  +3.2%    │ RELIANCE                      │
│ TCS        ₹3,210  -1.4%    │ 40 shares                     │
│ INFY       ₹1,920  +2.1%    │ Avg ₹2,450                    │
│ HDFC       ₹1,630  -0.8%    │ Current ₹2,840                │
│                              │ Value ₹1,13,600               │
│ [BUY] [SELL]                 │ P/L +₹15,600                 │
│                              │                                │
├──────────────────────────────┴────────────────────────────────┤
│ LIVE LEADERBOARD                                              │
├───────────────────────────────────────────────────────────────┤
│ TRANSACTION HISTORY                                           │
└───────────────────────────────────────────────────────────────┘
```

The exact layout can evolve during implementation, but the information
hierarchy must remain similar.

------------------------------------------------------------------------

# 9. Participant Dashboard --- Required Information

Always expose:

-   Cash Available
-   Current Portfolio Value
-   Total Profit/Loss
-   Current Holdings
-   Number of Shares
-   Average Buy Price
-   Current Share Price
-   Current Value of Each Holding
-   Total Dividends Received
-   Transaction History

Portfolio value must visually update when:

-   a trade succeeds
-   prices are applied
-   dividends are paid
-   cash changes
-   holdings change

Do not require manual page refresh.

------------------------------------------------------------------------

# 10. Market Table

The market table is one of the most important participant components.

Recommended columns:

``` text
Company
Symbol
Current Price
Change
Change %
Owned
Action
```

Example:

``` text
RELIANCE   REL   ₹2,840   +₹90   +3.27%   40   BUY
TCS        TCS   ₹3,210   -₹45   -1.38%   12   BUY
INFY       INF   ₹1,920   +₹40   +2.13%   0    BUY
```

The table should support:

-   sorting
-   searching
-   compact rows
-   clear positive/negative indicators
-   fast buy/sell actions

Avoid excessive animations when prices change.

Use subtle number transitions or flash indicators only when useful.

------------------------------------------------------------------------

# 11. Buy / Sell Interaction

Trading should feel fast.

Clicking `BUY` or `SELL` should open a compact trading interface.

Example:

``` text
BUY RELIANCE

Current Price
₹2,840

Quantity
[-] 10 [+]

Estimated Total
₹28,400

Available Cash
₹42,500

[ CANCEL ]       [ BUY ]
```

For selling:

``` text
SELL RELIANCE

Current Price
₹2,840

Quantity
[-] 10 [+]

Estimated Total
₹28,400

Owned
40 shares

[ CANCEL ]       [ SELL ]
```

The frontend may calculate an estimate for convenience, but the backend
remains authoritative.

After a successful trade:

-   update visible state immediately through realtime/server response
-   show a concise success notification
-   update cash
-   update holdings
-   update portfolio value
-   update transaction history
-   update leaderboard if applicable

------------------------------------------------------------------------

# 12. Portfolio Section

Each holding should clearly display:

-   Company
-   Quantity
-   Average buy price
-   Current price
-   Current value
-   Unrealized P/L
-   P/L percentage

Example:

``` text
RELIANCE
40 shares

AVG BUY        CURRENT
₹2,450        ₹2,840

VALUE
₹1,13,600

P/L
+₹15,600  (+15.92%)
```

Provide an optional portfolio allocation visualization if it does not
reduce usability.

------------------------------------------------------------------------

# 13. Leaderboard

The leaderboard should be visible without requiring a separate page.

Rank teams by:

**Final Total Portfolio Value**

Recommended format:

``` text
LIVE LEADERBOARD

#   TEAM             PORTFOLIO VALUE       P/L

1   Alpha            ₹1,42,300             +₹42,300
2   Sigma            ₹1,38,920             +₹38,920
3   Phoenix          ₹1,29,440             +₹29,440
4   Nova             ₹1,21,830             +₹21,830
```

The current participant's team should be visually identifiable.

Rank changes should use subtle motion rather than aggressive animations.

------------------------------------------------------------------------

# 14. Transaction History

Show:

-   time
-   company
-   transaction type
-   quantity
-   execution price
-   total value

Example:

``` text
16:12:42   BUY     RELIANCE    20    ₹2,650    ₹53,000
16:10:08   SELL    TCS         10    ₹3,200    ₹32,000
16:05:17   BUY     INFY        30    ₹1,850    ₹55,500
```

Newest transactions should appear first.

------------------------------------------------------------------------

# 15. Realtime UI Events

The frontend should be designed around realtime events.

Expected events include:

``` text
ROUND_STARTED
ROUND_ENDED

MARKET_OPENED
MARKET_CLOSED

TRADING_PAUSED
TRADING_RESUMED

TRADE_EXECUTED

PRICE_CHANGES_APPLIED

DIVIDENDS_PAID

CASH_UPDATED
HOLDINGS_UPDATED
LEADERBOARD_UPDATED

VIDEO_PLAY
VIDEO_STOP
```

Each event should update only the affected UI state.

Do not refresh the entire application after every event.

------------------------------------------------------------------------

# 16. Price Change Behavior

This is a critical UI requirement.

## Participant

Participants only see:

``` text
CURRENT MARKET PRICE
```

They should have no UI representation of pending prices.

When the admin applies changes:

``` text
Old:
RELIANCE ₹2,500

        ↓ realtime event

New:
RELIANCE ₹2,800
```

Use a subtle visual transition to communicate that the market moved.

Do not show an editable field or "pending" value to participants.

------------------------------------------------------------------------

# 17. Admin Panel

The Admin Panel should prioritize operational control.

Recommended layout:

``` text
┌─────────────────────────────────────────────────────────────┐
│ SANDBOX CONTROL CENTER                    ROUND 2   08:42  │
├─────────────────────────────────────────────────────────────┤
│ ROUND CONTROL                                                │
│                                                             │
│ [START ROUND 1] [END ROUND 1]                              │
│ [START ROUND 2] [END ROUND 2]                              │
│ [START ROUND 3] [END ROUND 3]                              │
│                                                             │
│ MARKET                                                       │
│ [OPEN MARKET] [CLOSE MARKET]                               │
│ [PAUSE TRADING] [RESUME TRADING]                           │
├─────────────────────────────────────────────────────────────┤
│ PRICE EDITOR                                                 │
│                                                             │
│ Company       Current       New Price        Status          │
│ RELIANCE      ₹2500         ₹2800            Pending         │
│ TCS           ₹3400         ₹3100            Pending         │
│ INFY          ₹1600         ₹1900            Pending         │
│                                                             │
│                  [ APPLY PRICE CHANGES ]                    │
├─────────────────────────────────────────────────────────────┤
│ VIDEOS                                                       │
│                                                             │
│ Video 1    [SELECT]                                         │
│ Video 2    [SELECT]                                         │
│ Video 3    [SELECT]                                         │
│                                                             │
│                  [ PLAY VIDEO ]                             │
├─────────────────────────────────────────────────────────────┤
│ DIVIDENDS                                                    │
│                                                             │
│ Company [RELIANCE]   ₹/share [25]   [PAY DIVIDEND]          │
├─────────────────────────────────────────────────────────────┤
│                    [ RESET COMPETITION ]                    │
└─────────────────────────────────────────────────────────────┘
```

------------------------------------------------------------------------

# 18. Admin Round Controls

Required buttons:

-   Start Round 1
-   End Round 1
-   Start Round 2
-   End Round 2
-   Start Round 3
-   End Round 3
-   Open Market
-   Close Market
-   Pause Trading
-   Resume Trading
-   Apply Price Changes
-   Pay Dividends
-   Reset Competition

Buttons should have clear enabled/disabled states.

Example:

If Round 2 is active:

``` text
Start Round 1    DISABLED
End Round 1      DISABLED

Start Round 2    DISABLED
End Round 2      ENABLED

Start Round 3    DISABLED
End Round 3      DISABLED
```

The frontend should prevent obviously invalid actions, but backend
validation remains authoritative.

------------------------------------------------------------------------

# 19. Admin Price Editor

The price editor must support:

-   increase price
-   decrease price
-   set exact price

Prefer a compact editor such as:

``` text
RELIANCE

Current Price: ₹2,500

New Price
[ ₹2,800 ]

Change
+₹300

[ SAVE PENDING CHANGE ]
```

Or an efficient table editor for bulk updates.

Pending changes should be visually distinct:

``` text
3 PENDING CHANGES
```

The admin should be able to review them before applying.

Example:

``` text
RELIANCE   ₹2,500 → ₹2,800
TCS        ₹3,400 → ₹3,100
INFY       ₹1,600 → ₹1,900
```

Then:

``` text
[ APPLY PRICE CHANGES ]
```

This should be a high-emphasis action.

------------------------------------------------------------------------

# 20. Apply Price Changes UX

Before applying:

``` text
3 pending price changes

[ APPLY PRICE CHANGES ]
```

Clicking the button should open a confirmation step if appropriate:

``` text
Apply 3 price changes?

RELIANCE   ₹2,500 → ₹2,800
TCS        ₹3,400 → ₹3,100
INFY       ₹1,600 → ₹1,900

This will immediately affect all teams.

[ CANCEL ] [ APPLY ]
```

After successful application:

``` text
✓ Price changes applied
```

Participants should receive the new prices through realtime state
updates.

------------------------------------------------------------------------

# 21. Timer

The timer is a core UI element.

Display:

``` text
14:52
```

When approaching the end:

``` text
01:00
```

Use a stronger warning state.

At zero:

``` text
00:00
ROUND ENDED
```

The frontend should calculate display time from an authoritative server
start/end timestamp.

Never rely on a local decrementing timer as the source of truth.

------------------------------------------------------------------------

# 22. Market Status

Use clear states:

``` text
🟢 MARKET OPEN
🟡 TRADING PAUSED
🔴 MARKET CLOSED
```

Trading buttons should automatically reflect the state.

For example:

``` text
MARKET CLOSED

[ BUY ] disabled
[ SELL ] disabled
```

------------------------------------------------------------------------

# 23. Notifications

Use compact toast notifications for events such as:

``` text
Trade successful
```

``` text
Price changes applied
```

``` text
Dividend received
```

``` text
Trading paused by admin
```

``` text
Round 2 has ended
```

Avoid excessive notifications for every tiny state update.

Important competition events can also use a persistent status banner.

------------------------------------------------------------------------

# 24. Error States

Errors should be understandable to participants.

Avoid exposing raw backend/database errors.

Bad:

``` text
PostgrestError: 23505...
```

Good:

``` text
Trade could not be completed.

Your cash balance has changed.
Please try again.
```

Other examples:

``` text
Trading is currently paused.

The market is closed.

The round has ended.

You do not own enough shares.

You do not have enough cash.

The selected stock is unavailable.
```

------------------------------------------------------------------------

# 25. Loading States

Use skeletons for major dashboard sections.

Do not show blank white/black areas while data loads.

For actions:

``` text
BUYING...
APPLYING...
PAYING...
STARTING...
```

Buttons should become temporarily disabled during an action to prevent
duplicate submissions.

------------------------------------------------------------------------

# 26. Connection State

Because this is a realtime competition, connection status matters.

Consider a small indicator:

``` text
● LIVE
```

or:

``` text
● RECONNECTING
```

If the realtime connection drops:

``` text
REALTIME CONNECTION LOST

Reconnecting...
```

The UI should not falsely claim that it is receiving live updates when
it is disconnected.

------------------------------------------------------------------------

# 27. Component Architecture

Suggested structure:

``` text
components/
│
├── layout/
│   ├── AppShell
│   ├── Header
│   └── ConnectionStatus
│
├── competition/
│   ├── RoundBadge
│   ├── CompetitionTimer
│   ├── MarketStatus
│   └── RoundStatus
│
├── participant/
│   ├── PortfolioSummary
│   ├── MarketTable
│   ├── StockRow
│   ├── TradeModal
│   ├── HoldingsTable
│   ├── Leaderboard
│   ├── TransactionHistory
│   └── VideoOverlay
│
├── admin/
│   ├── RoundControls
│   ├── MarketControls
│   ├── PriceEditor
│   ├── PendingChanges
│   ├── VideoManager
│   ├── DividendControls
│   └── ResetCompetition
│
└── ui/
    ├── Button
    ├── Modal
    ├── Dialog
    ├── Table
    ├── Badge
    ├── Toast
    └── Skeleton
```

Keep components small and focused.

Do not create a single 1,000-line dashboard component.

------------------------------------------------------------------------

# 28. Frontend Hooks

Suggested hooks:

``` text
useCompetitionState()
useCompetitionTimer()
useMarketState()
useStocks()
usePortfolio()
useLeaderboard()
useTransactions()
useRealtimeEvents()
useAdminControls()
```

These hooks should encapsulate frontend behavior and subscription
management.

Do not duplicate realtime subscription logic across multiple components.

------------------------------------------------------------------------

# 31. Important Frontend Principle

There are three categories of state.

## Server-authoritative state

Examples:

-   stock price
-   cash
-   holdings
-   P/L
-   round
-   market status
-   leaderboard

The frontend displays this state.

## Local UI state

Examples:

-   modal open/closed
-   selected stock
-   selected video
-   search text
-   sort direction
-   confirmation dialog
-   quantity input

The frontend owns this state.

## Derived display state

Examples:

-   estimated trade total
-   remaining timer display
-   P/L percentage
-   formatted currency
-   table filters

These can be calculated locally from authoritative data.

Never confuse derived state with authoritative state.

------------------------------------------------------------------------

# 32. Currency Formatting

Use Indian currency formatting consistently:

``` text
₹1,00,000
₹42,500
₹1,18,420
```

Use proper numeric formatting rather than manually inserting commas.

Prices should generally display with two decimal places only when
needed.

For example:

``` text
₹2,840
```

rather than:

``` text
₹2840.00
```

unless the competition's price rules require decimals.

------------------------------------------------------------------------

# 33. Accessibility

The app will be used in a live competition, so controls must be easy to
identify.

Requirements:

-   keyboard-accessible controls
-   visible focus states
-   sufficient contrast
-   buttons with clear labels
-   dialogs that trap focus
-   tables with appropriate semantics
-   do not communicate information through color alone

Critical states should include text:

``` text
+3.2%
GAIN
```

not only green color.

------------------------------------------------------------------------

# 34. Animation

Use animation deliberately.

Good uses:

-   price update flash
-   leaderboard rank movement
-   modal transitions
-   toast appearance
-   number transitions
-   video overlay entry

Avoid:

-   constant moving backgrounds
-   excessive parallax
-   distracting stock ticker animations
-   long transitions on trading actions

Trading interactions should feel immediate.

------------------------------------------------------------------------

# 35. Performance

The application may have many participant clients connected
simultaneously.

Frontend requirements:

-   avoid unnecessary rerenders
-   subscribe only to relevant realtime channels/events
-   virtualize very large transaction lists if necessary
-   memoize expensive derived calculations
-   avoid polling when realtime subscriptions can provide updates
-   avoid downloading unnecessary video data
-   lazy-load noncritical admin components

The participant dashboard should remain responsive during rapid trading.

------------------------------------------------------------------------

# 36. Security Boundary

Frontend security is not actual competition security.

Never assume that:

``` text
disabled button
```

means:

``` text
action impossible
```

The backend must enforce all competition rules.

The frontend should still hide/disable invalid actions to provide good
UX.

Examples:

``` text
Round not active → disable trading
Market closed → disable trading
Trading paused → disable trading
Insufficient cash → disable/validate buy
Insufficient shares → disable/validate sell
```

------------------------------------------------------------------------

# 37. What the Frontend Must NOT Do

Do not implement:

-   client-authoritative stock prices
-   client-authoritative portfolio values
-   client-authoritative leaderboard calculations
-   automatic market price changes
-   local-only round timers
-   fake synchronization between browsers
-   participant-side admin controls
-   automatic polling as the primary realtime mechanism
-   hidden price updates before `Apply Price Changes`

The frontend should never independently "simulate" the market.

------------------------------------------------------------------------

# 38. Expected User Experience

## Participant

The participant should immediately understand:

1.  Which round is active.
2.  How much time remains.
3.  Whether trading is open.
4.  How much cash they have.
5.  How much their portfolio is worth.
6.  Whether they are winning/losing.
7.  What stocks are available.
8.  How many shares they own.
9.  How to buy/sell quickly.
10. When the market has changed.
11. Their current leaderboard position.

There should be minimal navigation.

------------------------------------------------------------------------

## Admin

The admin should immediately understand:

1.  Which round is active.
2.  How much time remains.
3.  Whether the market is open.
4.  Whether trading is paused.
5.  Which price changes are pending.
6.  What video is selected.
7.  Which video is currently playing.
8.  When prices were last applied.
9.  Current leaderboard.
10. Whether realtime connections are healthy.

The admin should be able to operate the entire competition from one
primary dashboard.

------------------------------------------------------------------------

# 39. UI Success Criteria

The frontend is successful if:

-   A participant can understand the market within seconds.
-   Buying/selling requires minimal interaction.
-   Admin controls are obvious and hard to misuse.
-   Pending prices are impossible for participants to see.
-   Applying prices produces an obvious synchronized market update.
-   The timer remains synchronized after refreshes.
-   Video playback begins consistently across participant screens.
-   Leaderboard changes are immediately visible.
-   The UI remains usable during rapid trading.
-   The application looks polished enough to feel like a real
    competition platform.

------------------------------------------------------------------------

# 40. Implementation Priority

Build in this order:

### Phase 1 --- Visual foundation

-   App shell
-   typography
-   color tokens
-   buttons
-   tables
-   dialogs
-   badges
-   timer
-   status indicators

### Phase 2 --- Participant UI

-   dashboard
-   market table
-   buy/sell modal
-   holdings
-   portfolio summary
-   leaderboard
-   transactions

### Phase 3 --- Admin UI

-   round controls
-   market controls
-   price editor
-   pending changes
-   video manager
-   dividend controls
-   reset control

### Phase 4 --- Realtime integration

-   competition state
-   timer synchronization
-   market updates
-   trade updates
-   leaderboard updates
-   video playback events

### Phase 5 --- Polish

-   animations
-   loading states
-   error states
-   connection status
-   responsive behavior
-   accessibility
-   performance optimization

------------------------------------------------------------------------

# 41. Definition of Done --- Frontend

The UI/frontend portion is considered complete when:

-   Both Admin and Participant interfaces exist.
-   The participant dashboard contains all required information.
-   The admin dashboard contains all required controls.
-   The timer displays authoritative competition time.
-   Market status is clearly represented.
-   Pending price changes have a dedicated admin workflow.
-   Participants cannot see pending prices.
-   Applied prices visibly update the participant interface.
-   Leaderboard updates without manual refresh.
-   Trading UI supports buy/sell workflows.
-   Video playback UI exists for Round 3.
-   Video events can be reflected across participant clients.
-   Dividends can be represented in the participant UI.
-   Reset/round state changes are represented correctly.
-   Loading, error, paused, closed, and ended states are handled.
-   Realtime connection loss is communicated.
-   The visual design is consistent across the application.
-   No frontend component treats local state as the authoritative
    competition state.

------------------------------------------------------------------------

# 42. Final Product Principle

SANDBOX should feel like a **live financial competition terminal**.

The interface should communicate:

``` text
LIVE MARKET
LIVE MONEY
LIVE RANKINGS
LIVE DECISIONS
```

while keeping the actual competition authority on the server.

The most important frontend behavior is therefore:

``` text
USER ACTION
    ↓
BACKEND
    ↓
AUTHORITATIVE STATE
    ↓
REALTIME EVENT
    ↓
ALL RELEVANT CLIENTS UPDATE
```

For price changes specifically:

``` text
ADMIN EDITS
    ↓
PENDING PRICE
    ↓
PARTICIPANTS SEE NOTHING
    ↓
ADMIN: APPLY PRICE CHANGES
    ↓
AUTHORITATIVE MARKET UPDATE
    ↓
REALTIME BROADCAST
    ↓
PARTICIPANTS SEE NEW PRICE
    ↓
PORTFOLIO / P&L / LEADERBOARD UPDATE
```

This behavior is the core of the SANDBOX frontend.
# 43. Backend & Production Architecture

The frontend specification above remains authoritative for UI/UX behavior. This section
adds the complete backend contract and implementation requirements.

The backend is the **only authority for competition state**. The system must be designed
so that multiple admin and participant browsers remain synchronized in real time and no
client can bypass competition rules by modifying requests, browser state, or Supabase
calls.

## 43.1 Required Backend Stack

Use:

- **Supabase**
  - PostgreSQL as the primary database
  - Supabase Auth for administrator authentication
  - Supabase Realtime for authoritative state propagation
  - Supabase Storage for Round 3 videos
  - Row Level Security (RLS) for every exposed table
  - Edge Functions only where server-side orchestration is required
- **Next.js + TypeScript** for the application/API layer
- PostgreSQL transactions / RPC functions for all money-moving and state-changing
  operations
- Server-side validation for every mutation
- UTC timestamps in storage; format to the competition's local timezone in the UI

Do not introduce a second database unless there is a demonstrated requirement.

Do not make the browser a privileged database client.

---

# 44. Backend Responsibilities

The backend must own:

- competition lifecycle
- round lifecycle
- authoritative server time
- market state
- stock prices
- pending price changes
- trade execution
- cash balances
- holdings
- portfolio valuation
- realized/unrealized P&L
- dividends
- leaderboard ranking
- transaction history
- Round 3 video playback commands
- participant/team identity
- admin authorization
- idempotency
- concurrency control
- audit logging
- reset behavior
- realtime event publication
- validation and business rules
- protection against duplicate or replayed requests

The backend must never trust:

- client-calculated prices
- client-calculated totals
- client-calculated balances
- client-calculated holdings
- client-provided portfolio values
- client-provided rankings
- client-provided round state
- client-provided market state
- client-provided timer values
- client-provided authorization claims
- hidden frontend controls

---

# 45. Competition State Machine

The competition is a state machine, not a collection of unrelated boolean flags.

Represent authoritative competition state with explicit fields such as:

- `current_round`
- `round_status`
- `market_status`
- `trading_status`
- `round_started_at`
- `round_ends_at`
- `version`

Recommended round states:

```text
NOT_STARTED
ACTIVE
ENDED
```

Recommended market states:

```text
OPEN
CLOSED
```

Recommended trading states:

```text
OPEN
PAUSED
```

A round being `ACTIVE` does not automatically imply that trading is allowed.
The effective trading permission must be determined from the authoritative state.

At minimum:

```text
round_status = ACTIVE
AND market_status = OPEN
AND trading_status = OPEN
```

must be true before a trade is accepted.

All state transitions must be validated server-side.

Invalid transitions must fail with a stable application error code.

Examples:

```text
START_ROUND_2 while ROUND_1 is active -> reject
RESUME_TRADING while trading is already open -> reject
OPEN_MARKET while market is already open -> reject
APPLY_PRICE_CHANGES while no valid active round exists -> reject
TRADE after round end -> reject
```

Never implement state transitions as independent client-side toggles.

---

# 46. Database Model

Use normalized PostgreSQL tables with UUID primary keys unless a smaller integer key
is materially better for a specific table.

Required logical entities:

```text
competitions
competition_rounds
teams
participant_sessions
stocks
market_prices
pending_price_changes
holdings
trades
cash_ledger
dividend_payments
videos
video_playback_events
admin_actions
realtime_events
idempotency_keys
```

## 46.1 competitions

Stores the single competition instance.

Suggested fields:

```text
id uuid primary key
name text not null
status text not null
current_round integer
created_at timestamptz
updated_at timestamptz
version bigint not null default 0
```

`version` must increase on authoritative state changes where optimistic concurrency
or client synchronization requires it.

If the application supports only one live competition, still keep a competition ID.
Do not hard-code a global row into application code.

## 46.2 competition_rounds

Stores each round's authoritative timing and lifecycle.

```text
id uuid primary key
competition_id uuid references competitions
round_number integer not null
status text not null
duration_seconds integer not null
started_at timestamptz
ends_at timestamptz
ended_at timestamptz
created_at timestamptz
updated_at timestamptz
```

Enforce one row per `(competition_id, round_number)`.

Round durations must be data-driven. The initial configuration is:

```text
Round 1 = 900 seconds
Round 2 = 900 seconds
Round 3 = 900 seconds
```

Do not persist a decrementing counter every second.

Persist start/end timestamps and derive remaining time from server time.

## 46.3 teams

```text
id uuid primary key
competition_id uuid references competitions
name text not null
join_code_hash text
starting_cash numeric(20,2) not null
created_at timestamptz
updated_at timestamptz
```

Team names must be unique within a competition.

Never store a plaintext long-lived participant secret when a hash is sufficient.

## 46.4 participant_sessions

Participants do not need a conventional public login UI, but the backend still needs
a secure identity boundary.

Use short-lived participant sessions associated with a team.

```text
id uuid primary key
competition_id uuid references competitions
team_id uuid references teams
token_hash text
expires_at timestamptz
created_at timestamptz
revoked_at timestamptz
last_seen_at timestamptz
```

A participant session must identify exactly one team.

Never accept `team_id` from an unauthenticated trade request as proof of identity.

## 46.5 stocks

```text
id uuid primary key
competition_id uuid references competitions
symbol text not null
company_name text not null
initial_price numeric(20,2) not null
active boolean not null default true
created_at timestamptz
updated_at timestamptz
```

Unique:

```text
(competition_id, symbol)
```

## 46.6 market_prices

Keep the currently authoritative price separate from pending admin edits.

```text
id uuid primary key
competition_id uuid references competitions
stock_id uuid references stocks
current_price numeric(20,2) not null
previous_price numeric(20,2)
updated_at timestamptz
version bigint not null default 0
```

Unique:

```text
(competition_id, stock_id)
```

The participant interface must read only authoritative current prices.

## 46.7 pending_price_changes

```text
id uuid primary key
competition_id uuid references competitions
stock_id uuid references stocks
new_price numeric(20,2) not null
created_by uuid
created_at timestamptz
updated_at timestamptz
status text not null
```

Allowed statuses:

```text
PENDING
APPLIED
CANCELLED
```

Pending rows must never be exposed through participant RLS policies.

The application may use a server-side RPC to atomically apply all pending changes.

## 46.8 holdings

Use one current position per team and stock.

```text
id uuid primary key
competition_id uuid references competitions
team_id uuid references teams
stock_id uuid references stocks
quantity bigint not null default 0
average_buy_price numeric(20,2) not null default 0
updated_at timestamptz
version bigint not null default 0
```

Unique:

```text
(team_id, stock_id)
```

Quantity must never become negative.

## 46.9 trades

This is the immutable trade execution record.

```text
id uuid primary key
competition_id uuid references competitions
team_id uuid references teams
stock_id uuid references stocks
side text not null
quantity bigint not null
execution_price numeric(20,2) not null
gross_value numeric(20,2) not null
executed_at timestamptz not null
client_request_id uuid not null
created_at timestamptz not null
```

Allowed side:

```text
BUY
SELL
```

Unique:

```text
(team_id, client_request_id)
```

This constraint is required for idempotent trade requests.

Never update an executed trade.

## 46.10 cash_ledger

Do not rely only on a mutable `cash` column.

Record money movement as an immutable ledger.

```text
id uuid primary key
competition_id uuid references competitions
team_id uuid references teams
trade_id uuid
dividend_payment_id uuid
entry_type text not null
amount numeric(20,2) not null
balance_after numeric(20,2) not null
created_at timestamptz not null
```

Examples:

```text
STARTING_BALANCE
BUY
SELL
DIVIDEND
RESET
ADJUSTMENT
```

Positive amounts increase cash.
Negative amounts decrease cash.

A server-side transaction must ensure `balance_after` is correct.

If a cached current cash field is also used for performance, the ledger remains the
audit source and all mutations must update both atomically.

## 46.11 dividend_payments

```text
id uuid primary key
competition_id uuid references competitions
stock_id uuid references stocks
amount_per_share numeric(20,2) not null
total_distributed numeric(20,2) not null
paid_at timestamptz not null
paid_by uuid not null
```

A dividend action must snapshot the eligible holdings at payment time.

Do not calculate dividend eligibility later from mutable current holdings.

## 46.12 videos

Store metadata in PostgreSQL and the actual file in Supabase Storage.

```text
id uuid primary key
competition_id uuid references competitions
title text not null
storage_path text not null
duration_seconds integer
created_at timestamptz
updated_at timestamptz
```

## 46.13 video_playback_events

```text
id uuid primary key
competition_id uuid references competitions
video_id uuid references videos
action text not null
position_seconds numeric(12,3)
sequence bigint not null
created_by uuid not null
created_at timestamptz not null
```

Allowed actions should include at least:

```text
PLAY
STOP
```

A monotonically increasing `sequence` prevents stale playback events from overriding
newer ones.

## 46.14 admin_actions

Every privileged mutation must be auditable.

```text
id uuid primary key
competition_id uuid references competitions
admin_user_id uuid not null
action_type text not null
request_id uuid
payload jsonb
created_at timestamptz not null
```

Never store secrets in the audit payload.

## 46.15 realtime_events

Use a durable event/outbox record for important competition events.

```text
id uuid primary key
competition_id uuid references competitions
sequence bigint not null
event_type text not null
entity_type text
entity_id uuid
payload jsonb not null
created_at timestamptz not null
```

Unique:

```text
(competition_id, sequence)
```

This provides a durable event history and gives clients a sequence number for
reconciliation after reconnects.

## 46.16 idempotency_keys

For non-trivial mutations:

```text
id uuid primary key
competition_id uuid references competitions
actor_id uuid not null
request_key uuid not null
operation text not null
response jsonb
created_at timestamptz not null
expires_at timestamptz
```

Unique:

```text
(actor_id, request_key, operation)
```

---

# 47. Money and Numeric Rules

Use PostgreSQL `numeric`, never JavaScript floating-point arithmetic for authoritative
money calculations.

Recommended:

```text
money: numeric(20,2)
price: numeric(20,2)
quantity: bigint
```

All authoritative calculations must happen inside PostgreSQL/server-side code.

Examples:

```text
trade_value = execution_price * quantity

portfolio_value =
    cash
    + SUM(current_price * quantity)

unrealized_pnl =
    SUM((current_price - average_buy_price) * quantity)
```

The exact definition of total P/L must be implemented consistently everywhere.

Never allow the client to submit:

```text
execution_price
gross_value
portfolio_value
pnl
balance_after
```

as authoritative values.

---

# 48. Atomic Trade Execution

Trade execution is the most important transaction in the backend.

Implement BUY and SELL through a server-side PostgreSQL function/RPC or equivalent
transactional backend endpoint.

The transaction must:

1. Authenticate the participant session.
2. Resolve the participant's team from the authenticated session.
3. Lock the relevant competition state.
4. Lock the relevant market price row.
5. Lock the relevant holding row.
6. Verify the round is active.
7. Verify the market is open.
8. Verify trading is not paused.
9. Verify the stock is active.
10. Validate quantity is a positive integer.
11. Read the authoritative current price.
12. Calculate the trade value server-side.
13. For BUY, verify sufficient cash.
14. For SELL, verify sufficient holdings.
15. Update cash atomically.
16. Update holdings atomically.
17. Insert the immutable trade record.
18. Insert the corresponding cash ledger entry.
19. Increment relevant versions.
20. Create the authoritative realtime/outbox event.
21. Commit everything as one transaction.

If any step fails, the entire transaction must roll back.

There must never be a state where:

```text
cash changed but trade did not exist
trade exists but holdings did not change
holdings changed but cash did not change
```

## 48.1 Concurrency

Two simultaneous requests must not be able to spend the same cash or sell the same
shares.

Use PostgreSQL row-level locking / transactional isolation.

Example:

```text
BEGIN
SELECT ... FOR UPDATE
validate
UPDATE
INSERT
COMMIT
```

Do not attempt to solve monetary concurrency with frontend state or JavaScript locks.

---

# 49. Trade Idempotency

The frontend must generate a unique `client_request_id` for every trade attempt.

If the same request is retried because of a timeout or network reconnect:

- do not execute the trade twice
- return the original result where possible
- do not create duplicate ledger entries
- do not create duplicate trade records

The database uniqueness constraint is the final protection.

---

# 50. Competition Lifecycle RPCs

Implement explicit backend operations for:

```text
start_round
end_round
open_market
close_market
pause_trading
resume_trading
set_pending_price
remove_pending_price
apply_price_changes
pay_dividend
play_video
stop_video
reset_competition
```

Each operation must:

- authenticate the caller
- verify admin authorization
- validate the state transition
- lock the competition state
- perform all related changes atomically
- create an audit record
- create a realtime event
- increment the competition/event version
- return the resulting authoritative state

Do not expose raw table updates as the normal admin control mechanism.

---

# 51. Round Start

`start_round(round_number)` must be atomic.

For a round start:

1. Verify the requested round is the next valid round.
2. Verify no other round is active.
3. Set the round to `ACTIVE`.
4. Set `started_at = server_now()`.
5. Set `ends_at = started_at + duration`.
6. Set competition `current_round`.
7. Set the appropriate market/trading state.
8. Increment state version.
9. Write an audit action.
10. Emit `ROUND_STARTED`.

The timer is therefore based on:

```text
ends_at - server_now()
```

not a browser counter.

---

# 52. Round End

`end_round(round_number)` must:

1. Lock competition state.
2. Verify the round is active.
3. Mark it ended.
4. Set `ended_at`.
5. Disable trading.
6. Close the market if required by the competition rules.
7. Increment state version.
8. Emit `ROUND_ENDED`.
9. Return authoritative state.

When the scheduled end timestamp is reached, the system must still prevent trades even
if an explicit admin `end_round` call has not yet happened.

The trade validation must compare the current server time with `ends_at`.

A background scheduler may finalize the displayed state, but correctness must never
depend on a scheduler running exactly at the deadline.

---

# 53. Market and Trading Controls

Implement these as independent state transitions:

```text
OPEN_MARKET
CLOSE_MARKET
PAUSE_TRADING
RESUME_TRADING
```

The server must reject trades whenever any relevant condition disallows trading.

Example:

```text
ROUND ACTIVE
MARKET OPEN
TRADING PAUSED

=> trade rejected
```

The timer and round state must not be paused merely because trading is paused unless
the competition specification explicitly changes that rule.

Trading pause and round timer are separate concepts.

---

# 54. Applying Price Changes

Pending prices are private admin state.

The `apply_price_changes` operation must:

1. Lock the competition.
2. Lock all pending price rows being applied.
3. Verify the competition is in a valid state.
4. Validate every new price.
5. Update `market_prices`.
6. Mark pending changes as `APPLIED`.
7. Create a market-change event containing only the new authoritative values.
8. Update/invalidate affected portfolio calculations.
9. Update leaderboard data if needed.
10. Write one admin audit action.
11. Commit atomically.

Participants must not receive pending-price events.

If there are 20 pending changes, participants should observe one coherent market update
rather than 20 intermediate states where possible.

---

# 55. Portfolio Valuation

Portfolio value must always be derivable from authoritative state.

At minimum:

```text
portfolio_value =
cash
+
SUM(holding.quantity * market_price.current_price)
```

Do not persist a manually edited portfolio value.

If a materialized/cache table is used for performance, it is a derived cache and must
be rebuildable from the source of truth.

P/L must use one documented formula throughout the application.

The frontend may display locally derived estimates between events, but authoritative
values must come from the backend.

---

# 56. Leaderboard

Leaderboard ranking is server-derived.

Rank teams by:

```text
final/current total portfolio value
```

with deterministic tie-breaking.

Define the tie-break rule explicitly. Recommended:

```text
1. portfolio value descending
2. total P/L descending
3. team name ascending
```

The backend should expose a leaderboard view/RPC rather than requiring every client to
recalculate rankings.

When a trade or market-price change affects rankings, publish a leaderboard update.

For performance, use a database view or carefully designed query/indexes rather than
maintaining fragile duplicated rank state.

---

# 57. Realtime Architecture

Realtime is a first-class backend subsystem.

Use Supabase Realtime for:

- competition state
- round transitions
- market state
- authoritative price changes
- trade confirmations / participant-specific updates
- leaderboard changes
- dividend events
- video playback commands
- reset events
- connection/recovery signaling where applicable

Do not use client-to-client synchronization.

The authoritative flow is:

```text
USER ACTION
    ↓
SERVER VALIDATION
    ↓
DATABASE TRANSACTION
    ↓
COMMITTED AUTHORITATIVE STATE
    ↓
REALTIME EVENT
    ↓
ALL RELEVANT CLIENTS
```

Never broadcast an event before its database transaction is committed.

---

# 58. Realtime Event Contract

> **Implementation source of truth:** See `SANDBOX_REALTIME_ARCHITECTURE.md`. Do not redefine event/channel/security behavior here. The canonical document contains the current event inventory; this section is only a compatibility reference for frontend typing.

Every event should have a stable shape.

Recommended:

```ts
type CompetitionEvent = {
  id: string
  competitionId: string
  sequence: number
  type:
    | "ROUND_STARTED"
    | "ROUND_ENDED"
    | "MARKET_OPENED"
    | "MARKET_CLOSED"
    | "TRADING_PAUSED"
    | "TRADING_RESUMED"
    | "TRADE_EXECUTED"
    | "PRICE_CHANGES_APPLIED"
    | "DIVIDEND_PAID"
    | "LEADERBOARD_UPDATED"
    | "VIDEO_PLAY"
    | "VIDEO_STOP"
    | "COMPETITION_RESET"
  entityType?: string
  entityId?: string
  payload: Record<string, unknown>
  createdAt: string
}
```

The exact TypeScript representation may differ, but event names and semantics must remain
stable.

Events must be versioned if their payload contracts change.

---

# 59. Event Visibility

Not every event is public to every client.

At minimum:

```text
Public competition events:
- round transitions
- market status
- authoritative prices
- leaderboard
- video playback
- competition reset

Team-scoped events:
- own trade result
- own cash update
- own holdings update
- own transaction history
- own dividend receipt

Admin-only events:
- pending price changes
- internal operational/audit details
```

Never send one team's private financial state to another team's client.

---

# 60. Realtime Reconnection and Recovery

A production realtime system must survive temporary disconnects.

On reconnect:

1. Client establishes the realtime subscription.
2. Client requests the current authoritative snapshot.
3. Client provides its last received event sequence where supported.
4. Server returns/replays missing events or returns a fresh snapshot.
5. Client applies the authoritative state.
6. Client resumes realtime subscriptions.

Never assume that an event sent while disconnected will automatically be received.

The UI must show:

```text
LIVE
RECONNECTING
OFFLINE
```

accurately.

A fresh snapshot is more authoritative than stale local state.

---

# 61. Realtime Channels

Use narrowly scoped channels.

Recommended conceptual channels:

```text
competition:{competitionId}:public
competition:{competitionId}:leaderboard
competition:{competitionId}:team:{teamId}
competition:{competitionId}:admin
```

Do not create one unrestricted global channel containing every team's balances,
holdings, and transactions.

Channel authorization must be enforced server-side.

---

# 62. Initial State API

Realtime alone is not sufficient.

Every participant/admin client must be able to obtain a complete authoritative snapshot
after initial load and after reconnect.

The snapshot should include the minimum required state for that role.

Participant snapshot:

```text
competition state
round state
market state
server timestamps
current prices
own cash
own holdings
own transaction history
leaderboard
active video playback state
```

Admin snapshot:

```text
competition state
round state
market state
current prices
pending price changes
videos
active video state
leaderboard
operational/realtime health
```

Do not expose admin-only fields in the participant snapshot.

---

# 63. Server Time Synchronization

The backend is the source of truth for time.

Expose:

```text
server_now
round_started_at
round_ends_at
```

The frontend calculates display time from timestamps.

Recommended client behavior:

```text
remaining_ms = round_ends_at - estimated_server_now
```

Estimate server time using request/response timing if needed.

Never store a "seconds remaining" value that must be decremented every second in the
database.

Never let a browser decide that a round has ended.

---

# 64. Authentication and Authorization

There is no conventional participant login UI requirement, but there must be a real
authorization boundary.

## Admin

Use Supabase Auth.

Only explicitly authorized admin users may call privileged operations.

Admin authorization must be checked server-side using authenticated identity and a
server-controlled role/allowlist.

Never trust:

```text
isAdmin: true
```

from a browser request.

## Participant

Participants receive a secure short-lived session associated with one team.

The session must not allow:

- switching team IDs
- reading another team's holdings
- reading another team's transactions
- writing market prices
- controlling rounds
- accessing pending prices
- resetting the competition

---

# 65. Row Level Security

RLS is mandatory for every table exposed through the Supabase client.

Default posture:

```text
DENY
```

Then explicitly grant required access.

Participants may read:

- public competition state
- public market prices
- public leaderboard
- their own team state
- their own trades
- their own ledger entries
- public active video state

Participants must not read:

- pending price changes
- other teams' holdings
- other teams' cash
- other teams' trades
- admin actions
- internal sessions
- private event payloads

Admins may read operational data according to their role.

Privileged mutations should go through controlled server-side functions/RPCs rather than
direct table writes.

---

# 66. API Contract

Keep the application API small and explicit.

Recommended mutation endpoints/actions:

```text
POST /api/participant/trade
POST /api/admin/round/start
POST /api/admin/round/end
POST /api/admin/market/open
POST /api/admin/market/close
POST /api/admin/trading/pause
POST /api/admin/trading/resume
POST /api/admin/prices/pending
DELETE /api/admin/prices/pending/:id
POST /api/admin/prices/apply
POST /api/admin/dividends/pay
POST /api/admin/videos/play
POST /api/admin/videos/stop
POST /api/admin/competition/reset
```

Read operations can use server components, route handlers, RPCs, or controlled Supabase
reads depending on the application architecture.

Do not create dozens of tiny endpoints for trivial field updates.

Mutations must have typed request and response schemas.

Use a runtime schema validator such as Zod at the application boundary.

---

# 67. Standard API Response

Successful mutation responses should contain authoritative results.

Example:

```json
{
  "ok": true,
  "requestId": "uuid",
  "data": {},
  "eventSequence": 123
}
```

Error responses:

```json
{
  "ok": false,
  "requestId": "uuid",
  "code": "TRADING_PAUSED",
  "message": "Trading is currently paused."
}
```

Stable error codes are important because the frontend should map them to human-readable
messages without parsing database errors.

Never expose raw PostgreSQL/Supabase errors to users.

---

# 68. Required Error Codes

At minimum:

```text
UNAUTHORIZED
FORBIDDEN
INVALID_REQUEST
INVALID_STATE_TRANSITION
ROUND_NOT_ACTIVE
ROUND_ENDED
MARKET_CLOSED
TRADING_PAUSED
STOCK_UNAVAILABLE
INVALID_QUANTITY
INSUFFICIENT_CASH
INSUFFICIENT_SHARES
DUPLICATE_REQUEST
STALE_STATE
PRICE_CHANGE_INVALID
NO_PENDING_CHANGES
DIVIDEND_INVALID
VIDEO_NOT_FOUND
COMPETITION_RESETTING
RATE_LIMITED
INTERNAL_ERROR
```

The backend may expose additional codes.

---

# 69. Optimistic Concurrency

Administrative operations must protect against two admins acting simultaneously.

Use a combination of:

- row locks
- state validation
- version checks
- transactional updates

For example:

```text
expectedVersion = 42

UPDATE competition
SET version = version + 1
WHERE id = ...
AND version = 42
```

If the version no longer matches, return:

```text
STALE_STATE
```

The admin UI must then refresh authoritative state.

---

# 70. Reset Competition

`reset_competition` is a destructive operation.

It must require explicit admin confirmation and perform the reset atomically.

Reset should:

- end any active round
- close market
- pause trading
- clear pending price changes
- restore initial stock prices
- restore each team's starting cash
- clear holdings
- clear trade history for the new run, or archive the previous run if history is
  required
- clear dividend state
- reset video playback
- reset leaderboard state
- reset event sequence/version as defined by the implementation
- write an audit record
- emit `COMPETITION_RESET`

Prefer an explicit competition/run identifier if the application needs historical runs.
Do not silently destroy historical competition records in a production environment.

---

# 71. Round 3 Video System

Videos are stored in Supabase Storage.

Participants should not receive unrestricted write access to video storage.

Admin flow:

```text
upload video
    ↓
store metadata
    ↓
select video
    ↓
PLAY command
    ↓
durable playback event
    ↓
realtime broadcast
    ↓
participant players start
```

Playback events must include enough information for clients to converge on the current
state.

At minimum:

```text
video_id
action
server timestamp
sequence
position
```

Do not attempt to stream the video itself through the realtime database channel.

---

# 72. Dividends

`pay_dividend(stock_id, amount_per_share)` must execute atomically.

The server must:

1. Validate admin authorization.
2. Validate the stock.
3. Validate the dividend amount.
4. Lock the relevant holdings.
5. Snapshot eligible quantities.
6. Calculate each team's dividend.
7. Insert dividend records.
8. Add cash ledger entries.
9. Update authoritative balances.
10. Create realtime events.
11. Write an admin audit action.
12. Commit.

Do not calculate dividend payments in the browser.

The dividend payment record must be immutable.

---

# 73. Derived Data and Views

Prefer database views for consistently derived read models.

Recommended views:

```text
participant_portfolio_view
participant_holdings_view
leaderboard_view
market_view
current_competition_state_view
```

These views should make it difficult for frontend code to accidentally implement a
different formula.

If materialized/cached values are introduced, document:

- source of truth
- refresh mechanism
- invalidation mechanism
- recovery/rebuild process

Never create a cache that cannot be rebuilt.

---

# 74. Database Indexing

Create indexes for high-frequency access paths.

At minimum:

```text
competition_rounds(competition_id, round_number)
market_prices(competition_id, stock_id)
pending_price_changes(competition_id, status)
holdings(competition_id, team_id, stock_id)
trades(competition_id, team_id, executed_at desc)
cash_ledger(competition_id, team_id, created_at desc)
dividend_payments(competition_id, stock_id, paid_at desc)
video_playback_events(competition_id, sequence)
realtime_events(competition_id, sequence)
participant_sessions(token_hash)
```

Review indexes using actual query plans before adding large numbers of redundant
indexes.

---

# 75. Data Integrity Constraints

Use database constraints wherever possible.

Examples:

```text
quantity > 0 for trade quantities
quantity >= 0 for holdings
price > 0
amount_per_share >= 0
duration_seconds > 0
round_number in (1, 2, 3)
```

Use enums or check constraints for controlled state values.

Do not rely exclusively on TypeScript types for database integrity.

---

# 76. Transaction and Ledger Invariants

The backend must maintain these invariants:

```text
cash can never be negative
holdings can never be negative
trade quantity is always positive
trade execution price equals the authoritative market price at execution
trade gross value equals execution price * quantity
every BUY has a corresponding negative cash movement
every SELL has a corresponding positive cash movement
every trade changes holdings exactly once
every dividend payment changes cash exactly once
pending prices never affect participant-visible current prices
```

If an invariant would be violated, reject the transaction.

---

# 77. Production Logging

Use structured logs.

Every mutation should be traceable by:

```text
request_id
competition_id
actor_id
operation
result
duration_ms
created_at
```

Never log:

- participant session tokens
- passwords
- secrets
- full authorization headers
- private credentials

Use appropriate log levels:

```text
INFO
WARN
ERROR
```

Do not log every realtime event at high volume in production unless necessary for
diagnostics.

---

# 78. Auditability

The following actions must be auditable:

```text
start/end round
open/close market
pause/resume trading
create/update/remove pending price
apply prices
pay dividend
play/stop video
reset competition
admin authorization changes
manual adjustments
```

Audit entries must identify:

- who
- what
- when
- which competition
- request ID
- relevant non-sensitive parameters

Audit records are append-only.

---

# 79. Rate Limiting and Abuse Protection

Rate-limit:

- participant trade requests
- participant session creation
- admin mutation endpoints
- video commands
- repeated failed requests

Do not make the rate limits so strict that normal competition trading is blocked.

Trade rate limiting must be paired with idempotency and transactional correctness.

Never rely on rate limiting as the primary anti-cheating mechanism.

---

# 80. Input Validation

Validate all external input:

- UUIDs
- quantities
- prices
- round numbers
- video IDs
- dividend amounts
- request IDs
- session credentials

Reject unexpected fields where practical.

Normalize/validate strings such as team names and stock symbols.

Never interpolate user input into SQL.

Use parameterized queries/RPC arguments.

---

# 81. Secrets and Environment Variables

Never commit secrets.

Expected environment categories:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

Only the service-role key may perform privileged server-side operations, and it must
never be exposed to browser code.

Do not prefix privileged secrets with `NEXT_PUBLIC_`.

Use separate environments for development and production.

---

# 82. Supabase Realtime Security

Realtime authorization must follow the same access boundary as database reads.

A participant subscribed to:

```text
competition:{id}:team:{teamId}
```

must not be able to change the channel identifier to another team's ID and receive
their private state.

Do not place sensitive data in a public broadcast channel.

If an event payload contains private financial information, publish it only to the
authorized team channel.

---

# 83. Frontend Realtime Integration Contract

Frontend hooks must consume backend state rather than recreate backend logic.

Recommended hooks remain:

```text
useCompetitionState()
useCompetitionTimer()
useMarketState()
useStocks()
usePortfolio()
useLeaderboard()
useTransactions()
useRealtimeEvents()
useAdminControls()
```

Each hook should:

1. fetch initial authoritative state
2. subscribe to relevant realtime events
3. apply validated events
4. detect sequence gaps
5. refetch authoritative state on gaps/reconnect
6. expose connection state
7. clean up subscriptions on unmount

Do not put direct Supabase subscription code into every component.

---

# 84. Optimistic UI Rules

Optimistic UI is allowed only for non-authoritative visual feedback.

Examples:

```text
button -> BUYING...
modal -> submitting...
```

Do not optimistically mutate authoritative:

```text
cash
holdings
portfolio value
leaderboard
market price
round state
```

After a mutation, the authoritative server response/realtime event wins.

If a trade request is rejected, restore the UI from server state.

---

# 85. Realtime Ordering

All authoritative competition events should have a monotonic sequence number per
competition.

Clients must ignore stale events:

```text
incoming.sequence <= lastSequence
```

unless the event is part of an explicit replay/reconciliation flow.

If:

```text
incoming.sequence > lastSequence + 1
```

the client should assume it missed an event and request a fresh snapshot or replay.

Never attempt to guess the missing state locally.

---

# 86. Failure Handling

Every mutation must be safe under:

- duplicate HTTP requests
- browser refresh
- browser close during request
- network timeout
- websocket disconnect
- admin double-click
- two admins acting at once
- participant double-click
- stale frontend state
- server restart
- database transaction rollback

A request that times out does not imply that the operation failed.

Idempotency + authoritative re-fetch must resolve ambiguous outcomes.

---

# 87. Testing Requirements

Backend tests are mandatory before production.

## Unit tests

Cover:

- trade calculations
- P/L calculations
- portfolio valuation
- leaderboard sorting
- state transition rules
- dividend calculations
- validation
- error mapping

## Integration tests

Cover:

- BUY transaction
- SELL transaction
- insufficient cash
- insufficient shares
- closed market
- paused trading
- ended round
- price application
- dividend payment
- video event
- reset
- authorization
- RLS

## Concurrency tests

At minimum test:

```text
two simultaneous BUYs using the same cash
two simultaneous SELLs using the same shares
duplicate trade request
two admins applying price changes
admin ending round while participant submits a trade
trade arriving exactly around round expiry
```

The database must remain consistent after every test.

## Realtime tests

Verify:

```text
admin state change -> all participants update
trade -> correct participant state updates
price apply -> all participants receive new prices
leaderboard -> rankings converge
video play -> all participant clients converge
disconnect/reconnect -> state recovers
sequence gap -> client resynchronizes
```

---

# 88. Production Readiness

Before deployment, verify:

- RLS enabled on every exposed table
- no service-role key in browser bundles
- all mutations authenticated
- all admin mutations authorized
- all trade execution transactional
- all trade requests idempotent
- no client-authoritative money state
- no client-authoritative timer
- no pending prices exposed to participants
- database constraints installed
- indexes reviewed
- migrations reproducible
- structured logging enabled
- error responses sanitized
- audit logging enabled
- rate limiting enabled
- realtime reconnect path tested
- backup/restore process verified
- production environment variables configured
- storage permissions verified
- video upload permissions verified
- destructive reset protected
- concurrency tests passing
- end-to-end competition simulation passing

---

# 89. Database Migrations

Never make undocumented manual production schema edits.

Every schema change must be represented by a migration.

Migrations must be:

- ordered
- repeatable in a fresh environment
- reviewed
- tested before production
- backward-compatible where rolling deployment requires it

Seed data should be separate from schema migrations.

Competition configuration should be data, not hard-coded into frontend components.

---

# 90. Deployment Architecture

Recommended production flow:

```text
Browser
   │
   ├── Next.js application
   │
   ├── authenticated server actions / route handlers
   │
   └── Supabase Realtime
             │
             └── PostgreSQL
                    │
                    └── authoritative competition state
```

Supabase Storage handles Round 3 video assets.

Do not introduce a custom websocket server unless Supabase Realtime is demonstrably
insufficient.

Do not introduce Redis, Kafka, or another message broker for the initial production
implementation unless load testing proves a requirement.

---

# 91. Backend File Structure

Use a structure similar to:

```text
app/
├── api/
│   ├── participant/
│   │   └── trade/
│   └── admin/
│       ├── round/
│       ├── market/
│       ├── prices/
│       ├── dividends/
│       ├── videos/
│       └── competition/
│
lib/
├── auth/
├── competition/
├── trading/
├── market/
├── portfolio/
├── leaderboard/
├── dividends/
├── videos/
├── realtime/
├── validation/
├── errors/
├── logging/
└── supabase/
│
supabase/
├── migrations/
├── seed.sql
└── functions/
    ├── trade/
    ├── start-round/
    ├── end-round/
    ├── apply-price-changes/
    ├── pay-dividend/
    └── reset-competition/
│
types/
├── api.ts
├── competition.ts
├── trading.ts
└── realtime.ts
```

The exact structure may differ, but business logic must remain separated from UI
components.

---

# 92. Separation of Concerns

Keep these layers distinct:

```text
UI
 ↓
API / Server Action
 ↓
Validation
 ↓
Domain Service
 ↓
Database RPC / Transaction
 ↓
Database
 ↓
Realtime Event
```

Do not put SQL, authorization, and business rules directly into React components.

Do not duplicate business rules across:

```text
frontend
route handlers
RPCs
database triggers
```

The database transaction is the final authority for critical state changes.

---

# 93. Database Triggers

Use triggers only where they materially improve integrity or event/outbox behavior.

Good uses:

- maintaining immutable audit metadata
- creating durable outbox events after authoritative changes
- enforcing simple invariants

Avoid putting the entire competition engine into a maze of triggers.

Complex state transitions should be explicit transactional functions so they remain
testable and understandable.

---

# 94. Event Outbox Pattern

For important events, prefer:

```text
BEGIN
  mutate authoritative state
  insert realtime/outbox event
COMMIT
```

A dispatcher/realtime integration can then publish committed events.

The critical property is:

```text
database state and durable event record commit together
```

This prevents the failure mode where a trade succeeds but no realtime event exists.

---

# 95. Reconciliation

Provide a server-side way to rebuild derived state.

At minimum, it must be possible to reconstruct:

```text
cash
holdings
portfolio value
leaderboard
```

from:

```text
starting balances
trades
dividend payments
authoritative prices
```

This is essential for debugging disputes during a live competition.

If a cached balance disagrees with the ledger, the discrepancy must be detectable.

---

# 96. Competition Run Isolation

If SANDBOX will ever run more than one competition, every query must be scoped by
`competition_id`.

Never rely on:

```text
WHERE team_id = ...
```

alone when team IDs can exist across multiple competitions.

The current competition must be selected server-side.

A participant session must be bound to exactly one competition and team.

---

# 97. Security Checklist

Before calling the backend production-ready, confirm:

```text
[ ] RLS enabled everywhere required
[ ] Admin role cannot be forged
[ ] Participant cannot change team identity
[ ] Participant cannot access pending prices
[ ] Participant cannot access another team's private state
[ ] Participant cannot call admin mutations
[ ] Service role never reaches browser
[ ] All trade values calculated server-side
[ ] All critical mutations transactional
[ ] Duplicate requests are idempotent
[ ] Concurrency is protected
[ ] Sensitive logs are redacted
[ ] Inputs are validated
[ ] Rate limits exist
[ ] Destructive actions require authorization
[ ] Storage policies are restrictive
```

---

# 98. Implementation Order --- Backend

Implement backend work in this order:

### Phase 1 — Foundation

- Supabase project/environment setup
- migrations
- database schema
- enums/check constraints
- RLS
- indexes
- seed data
- typed database client
- environment validation
- error model
- logging

### Phase 2 — Identity

- admin authentication
- admin authorization
- participant session issuance
- participant session validation
- competition/team isolation

### Phase 3 — Competition Engine

- competition state
- round state machine
- server timestamps
- round start
- round end
- market open/close
- trading pause/resume

### Phase 4 — Trading Engine

- holdings
- cash ledger
- trade execution
- BUY
- SELL
- idempotency
- concurrency locking
- transaction history

### Phase 5 — Market Engine

- current prices
- pending price changes
- apply price changes
- portfolio valuation
- P/L
- leaderboard

### Phase 6 — Events and Realtime

- durable event/outbox records
- public competition events
- team-private events
- admin events
- sequence numbers
- initial snapshots
- reconnect/reconciliation

### Phase 7 — Competition Features

- dividends
- Round 3 videos
- playback events
- reset
- audit log

### Phase 8 — Production Hardening

- rate limiting
- structured logging
- monitoring
- backups
- failure testing
- concurrency testing
- RLS testing
- end-to-end simulation
- deployment verification

Do not move to visual polish while core monetary transactions are still mocked.

---

# 99. Backend Definition of Done

The backend is complete only when:

- [ ] PostgreSQL schema exists and is migration-driven.
- [ ] RLS policies are implemented and tested.
- [ ] Admin authentication and authorization work.
- [ ] Participant identity is secure and team-scoped.
- [ ] Competition state is server-authoritative.
- [ ] Round timers use server timestamps.
- [ ] Round start/end is transactional.
- [ ] Market controls are transactional.
- [ ] Trading pause/resume is authoritative.
- [ ] BUY is transactional.
- [ ] SELL is transactional.
- [ ] Cash cannot become negative.
- [ ] Holdings cannot become negative.
- [ ] Trade requests are idempotent.
- [ ] Concurrent trades cannot corrupt balances.
- [ ] Current prices are authoritative.
- [ ] Pending prices are private to admins.
- [ ] Price application is atomic.
- [ ] Portfolio valuation is server-derived.
- [ ] P/L is server-derived.
- [ ] Leaderboard is server-derived.
- [ ] Dividends are transactional.
- [ ] Video metadata and storage are secured.
- [ ] Video playback is realtime synchronized.
- [ ] Reset is safe and auditable.
- [ ] All important mutations are audited.
- [ ] Realtime events are emitted after committed state changes.
- [ ] Events have sequence numbers.
- [ ] Clients can recover after disconnects.
- [ ] Private team data never enters public channels.
- [ ] Service-role credentials never reach clients.
- [ ] API errors use stable application error codes.
- [ ] Production logs are structured and sanitized.
- [ ] Rate limiting exists.
- [ ] Unit, integration, concurrency, RLS, and realtime tests pass.
- [ ] A complete three-round competition can be executed without manual database edits.

---

# 100. Final Backend Principle

SANDBOX is a **real-time distributed system**, not a frontend simulation.

The authoritative sequence is always:

```text
CLIENT REQUEST
      ↓
AUTHENTICATE
      ↓
AUTHORIZE
      ↓
VALIDATE
      ↓
LOCK / TRANSACTION
      ↓
UPDATE DATABASE
      ↓
WRITE AUDIT / EVENT
      ↓
COMMIT
      ↓
REALTIME BROADCAST
      ↓
CLIENT RECONCILIATION
```

For trading:

```text
BUY / SELL REQUEST
      ↓
IDENTIFY TEAM
      ↓
READ AUTHORITATIVE PRICE
      ↓
LOCK CASH + HOLDING + COMPETITION STATE
      ↓
VALIDATE ROUND / MARKET / TRADING
      ↓
CALCULATE VALUE SERVER-SIDE
      ↓
UPDATE CASH
      ↓
UPDATE HOLDING
      ↓
INSERT IMMUTABLE TRADE
      ↓
INSERT CASH LEDGER ENTRY
      ↓
WRITE EVENT
      ↓
COMMIT
      ↓
REALTIME UPDATE
```

For admin price changes:

```text
ADMIN EDIT
      ↓
PENDING PRICE
      ↓
ADMIN-ONLY STATE
      ↓
APPLY
      ↓
LOCK COMPETITION + PENDING CHANGES
      ↓
UPDATE CURRENT PRICES ATOMICALLY
      ↓
WRITE MARKET EVENT
      ↓
COMMIT
      ↓
REALTIME BROADCAST
      ↓
ALL PARTICIPANTS CONVERGE
      ↓
PORTFOLIO / P&L / LEADERBOARD RECOMPUTE
```

The system is production-ready only when correctness survives malicious clients,
duplicate requests, concurrent requests, stale browsers, reconnects, server restarts,
and race conditions.

The browser is a view and an input device.

**The database and transactional backend are the competition.**
