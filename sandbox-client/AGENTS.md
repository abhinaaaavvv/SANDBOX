# AGENT.md --- SANDBOX UI & Frontend Specification

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

## Round 3 --- Video Trading

Duration: **15 minutes**

The admin can upload multiple videos before the competition.

During the round:

1.  Admin selects a video.
2.  Admin clicks `Play Video`.
3.  The selected video begins on every participant screen.
4.  Participants continue trading while watching.
5.  Admin prepares price changes privately.
6.  Admin clicks `Apply Price Changes`.
7.  Market state updates on every participant screen.
8.  Admin can select and play another video.
9.  The process can repeat until the round ends.

The participant video player should appear as an important temporary
overlay/panel without permanently destroying the trading interface.

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

# 21. Admin Video Controls

The video section should allow:

-   upload videos
-   view uploaded videos
-   select a video
-   play selected video
-   optionally stop the video

Example:

``` text
VIDEOS

┌───────────────────────────────┐
│ Video 1                       │
│ Market Shock                  │
│                               │
│ [ SELECT ]                    │
└───────────────────────────────┘

┌───────────────────────────────┐
│ Video 2                       │
│ Economic Boom                 │
│                               │
│ [ SELECT ]                    │
└───────────────────────────────┘

Selected: Market Shock

[ PLAY VIDEO ]
```

When playing:

``` text
NOW PLAYING
Market Shock

[ STOP VIDEO ]
```

------------------------------------------------------------------------

# 22. Participant Video Overlay

When the admin plays a video, participants should see a synchronized
video experience.

Recommended behavior:

-   open a prominent overlay
-   preserve essential trading controls where possible
-   video should begin from the synchronized server event
-   users should not be able to alter the competition's authoritative
    playback state

Example:

``` text
┌──────────────────────────────────────────┐
│                                          │
│             VIDEO PLAYBACK               │
│                                          │
│              [ VIDEO ]                   │
│                                          │
│                                          │
│             Market Shock                 │
│                                          │
└──────────────────────────────────────────┘
```

Trading should continue during video playback unless the competition
state says otherwise.

------------------------------------------------------------------------

# 23. Timer

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

# 24. Market Status

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

# 25. Notifications

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

# 26. Error States

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

# 27. Loading States

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

# 28. Connection State

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

# 29. Component Architecture

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

# 30. Frontend Hooks

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
useVideoPlayback()
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

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
