
# SANDBOX — UI Design System

## 1. Design Direction

SANDBOX should look like a **premium financial competition terminal**.

The visual language should be:

* Minimal
* Editorial
* Precise
* Sophisticated
* High-density without feeling cluttered
* Neutral
* Technical
* Quietly luxurious

The interface should feel closer to a **high-end trading terminal / financial publication / modern editorial dashboard** than a typical SaaS dashboard.

Do not make it look like a generic AI-generated dashboard.

The design should communicate confidence through restraint.

---

# 2. Core Visual Principle

> **Less decoration. More hierarchy.**

Every visual element must have a purpose.

Prioritize:

1. Typography
2. Spacing
3. Alignment
4. Borders
5. Information hierarchy
6. Numbers
7. Subtle state changes

Avoid relying on:

* gradients
* shadows
* excessive color
* giant cards
* decorative illustrations
* excessive icons
* glassmorphism
* excessive blur
* excessive animation

---

# 3. Typography

Use exactly **two font families** throughout the application.

### JetBrains Mono

Use for:

* numbers
* prices
* portfolio values
* P/L
* timers
* stock symbols
* tables
* buttons where appropriate
* technical/status information
* timestamps
* transaction data

JetBrains Mono should create the technical/trading-terminal character.

### EB Garamond

Use for:

* SANDBOX branding
* major page titles
* section titles where appropriate
* editorial headings
* important contextual copy
* occasional large display text

EB Garamond should provide the editorial/luxury contrast.

Do not introduce additional font families.

Do not use Inter, Geist, Roboto, Arial, system UI fonts, or other fallback font families as intentional design choices.

---

# 4. Typography Contrast

The strongest visual identity should come from the contrast between:

**EB Garamond**
→ editorial, human, premium

and

**JetBrains Mono**
→ technical, precise, financial

Example:

```text
SANDBOX
```

in EB Garamond.

Then:

```text
ROUND 02     08:42     MARKET OPEN
```

in JetBrains Mono.

And:

```text
₹1,18,420
```

in JetBrains Mono.

This contrast should be used consistently.

---

# 5. Color System

Use a **neutral monochromatic palette**.

The interface should primarily consist of:

* near-black
* charcoal
* dark gray
* medium gray
* off-white
* white

Avoid introducing a strong brand color throughout the interface.

Color should communicate state rather than decoration.

### Positive

Use a restrained green only for:

* gains
* positive P/L
* successful actions
* upward price movement

### Negative

Use a restrained red only for:

* losses
* negative P/L
* downward price movement
* destructive actions

### Warning

Use a restrained amber only when necessary for:

* low timer
* paused states
* important warnings

Do not make the entire UI colorful.

The majority of the interface should remain neutral.

---

# 6. No Excessive Rounded Corners

Avoid the modern "everything is a pill/card" aesthetic.

Prefer:

* square corners
* sharp edges
* subtle 2–4px rounding only when functionally useful

Do NOT create:

```text
[   Huge Rounded Card   ]
```

for every section.

Tables, panels, controls, and containers should generally have sharp or nearly sharp geometry.

Pills should be reserved for compact statuses where they genuinely improve readability.

---

# 7. Borders Over Shadows

Use borders as the primary method of separating UI sections.

Prefer:

```text
──────────────
```

and subtle vertical/horizontal rules.

Avoid heavy drop shadows.

Avoid floating-card aesthetics.

The interface should feel structured into a grid rather than composed of floating boxes.

---

# 8. Layout

Use a strong grid system.

The participant dashboard should feel like a professional trading workspace.

Example:

```text
┌─────────────────────────────────────────────────────────────┐
│ SANDBOX                         ROUND 02       08:42         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ CASH             PORTFOLIO             P/L                  │
│ ₹42,500          ₹1,18,420             +₹18,420             │
│                                                             │
├───────────────────────────────┬─────────────────────────────┤
│ MARKET                        │ HOLDINGS                   │
│                               │                             │
│ RELIANCE   ₹2,840   +3.2%    │ RELIANCE                   │
│ TCS        ₹3,210   -1.4%    │ 40 SHARES                 │
│ INFY       ₹1,920   +2.1%    │ AVG ₹2,450                │
│                               │ VALUE ₹1,13,600           │
│                               │                             │
├───────────────────────────────┴─────────────────────────────┤
│ LEADERBOARD                                                 │
├─────────────────────────────────────────────────────────────┤
│ TRANSACTION HISTORY                                         │
└─────────────────────────────────────────────────────────────┘
```

Use whitespace deliberately.

Do not make every section visually heavy.

---

# 9. Information Density

SANDBOX is a competition tool.

Participants need to scan information quickly.

Optimize for:

* fast numerical comparison
* readable tables
* obvious current state
* minimal navigation
* minimal clicking
* predictable placement

Do not sacrifice information density just to make the interface "clean".

The target is:

**dense but calm.**

---

# 10. Numbers

Numbers are extremely important.

Use JetBrains Mono for:

```text
₹1,00,000
₹1,18,420
+₹18,420
08:42
40
₹2,840
+3.21%
```

Align numerical columns consistently.

Use tabular-looking alignment wherever possible.

Important financial values should have strong visual hierarchy.

For example:

```text
PORTFOLIO VALUE

₹1,18,420
```

The number should dominate the label.

---

# 11. Timer

The timer is one of the most important elements in the entire interface.

It should be:

* highly visible
* compact
* technical
* unmistakable

Example:

```text
ROUND 02

08:42
```

Use JetBrains Mono.

Do not use a giant circular countdown widget.

A simple typographic timer is more appropriate.

Near the end of the round, subtly increase urgency.

---

# 12. Navigation

Keep navigation minimal.

There are only two application contexts:

```text
ADMIN
PARTICIPANT
```

Do not build a giant sidebar with 15 navigation items.

The participant experience should primarily be one dashboard.

The admin experience should primarily be one control center.

Use tabs or secondary navigation only when genuinely necessary.

---

# 13. Participant Interface

The participant dashboard should prioritize:

### Primary

* Portfolio value
* Cash
* P/L
* Timer
* Market status

### Secondary

* Market
* Holdings
* Leaderboard

### Tertiary

* Transactions
* Additional statistics

The participant should never need to hunt for:

```text
How much money do I have?
What is my portfolio worth?
Am I winning?
Can I trade?
How much time is left?
```

---

# 14. Admin Interface

The admin interface should prioritize operational clarity over decoration.

The most important controls are:

```text
START ROUND
END ROUND

OPEN MARKET
CLOSE MARKET

PAUSE TRADING
RESUME TRADING

APPLY PRICE CHANGES

PLAY VIDEO

PAY DIVIDEND

RESET COMPETITION
```

Critical destructive/high-impact actions should have confirmation where appropriate.

Do not hide important controls behind unnecessary menus.

---

# 15. Price Editor

The price editor should look like a professional market control table.

Example:

```text
PRICE EDITOR

COMPANY        CURRENT       NEW          CHANGE

RELIANCE       ₹2,500        ₹2,800       +₹300
TCS            ₹3,400        ₹3,100       -₹300
INFY           ₹1,600        ₹1,900       +₹300
```

Pending changes should be clearly visible to the admin.

Participants should never see this pending state.

The `APPLY PRICE CHANGES` action should be visually prominent but not visually obnoxious.

---

# 16. Tables

Tables are a major part of the product.

They should feel:

* precise
* dense
* aligned
* quiet
* professional

Use:

* thin separators
* consistent row heights
* strong column alignment
* monospace numerical data
* subtle hover states

Avoid:

* excessive row cards
* huge rounded table containers
* giant colored badges
* unnecessary icons inside every cell

---

# 17. Buttons

Buttons should be compact and deliberate.

Primary actions:

```text
APPLY PRICE CHANGES
BUY
SELL
START ROUND
PLAY VIDEO
```

should be visually obvious.

Secondary actions should be quieter.

Avoid oversized rounded buttons.

Prefer rectangular controls with strong typography and subtle borders.

Buttons should feel like **instruments**, not marketing CTAs.

---

# 18. Status Indicators

Use restrained status indicators.

Examples:

```text
● MARKET OPEN
● TRADING PAUSED
● MARKET CLOSED
```

Use color sparingly.

The text itself must communicate the state.

Never rely exclusively on color.

---

# 19. Cards

Cards should not be the default container for everything.

Use cards only when they provide meaningful grouping.

Prefer:

```text
PORTFOLIO VALUE
₹1,18,420
────────────────────
```

over:

```text
╭────────────────────╮
│  PORTFOLIO VALUE   │
│                    │
│    ₹1,18,420       │
╰────────────────────╯
```

The UI should feel more like a structured terminal/editorial layout than a collection of cards.

---

# 20. Motion

Motion should be subtle.

Good:

* number changes
* leaderboard movement
* price update indicators
* modal transitions
* video overlay transitions
* button loading states

Avoid:

* dramatic page transitions
* bouncing elements
* constant floating animations
* animated backgrounds
* unnecessary hover transformations

The application should feel fast.

---

# 21. Price Change Animation

When a price changes after the admin applies changes:

* briefly highlight the changed value
* optionally show the delta
* return to the normal neutral state

Example:

```text
₹2,500  →  ₹2,800
          +₹300
```

The animation should be short and informative.

Do not make the entire table flash.

---

# 22. Leaderboard Animation

When ranking changes:

* animate only affected rows
* keep the transition short
* preserve readability

Avoid flashy podium animations during normal updates.

The competition should feel serious.

---

# 23. Video Overlay

Round 3 video playback should preserve the visual language.

Avoid generic full-screen video-player UI if possible.

Use a clean overlay with:

```text
NOW PLAYING

Market Shock

[ VIDEO ]

ROUND 03                     08:21
```

The trading interface should remain conceptually present behind/around the video where practical.

---

# 24. Empty States

Keep empty states minimal.

Example:

```text
NO HOLDINGS

You currently don't own any shares.
```

Do not use large illustrations.

---

# 25. Loading States

Use understated skeletons and loading indicators.

Avoid spinners everywhere.

For actions:

```text
APPLYING...
BUYING...
SELLING...
STARTING...
```

Use typography and button state to communicate progress.

---

# 26. Error States

Errors should look calm and actionable.

Example:

```text
TRADE FAILED

Your available cash has changed.
Please review the order and try again.
```

Do not use giant red error panels for ordinary transaction failures.

---

# 27. Responsive Behavior

Desktop is the primary environment.

At smaller widths:

* preserve the timer
* preserve market status
* preserve portfolio value
* preserve trading controls
* allow dense tables to scroll
* collapse secondary information

Do not simply stack every section into huge cards.

Maintain the grid wherever possible.

---

# 28. Iconography

Use **Lucide React**.

Icons should be:

* small
* functional
* consistent
* secondary to typography

Do not replace text with icons when the meaning would become ambiguous.

Do not put an icon next to every piece of information.

---

# 29. Branding

The SANDBOX wordmark should use **EB Garamond**.

The branding should be understated.

Do not create a giant logo occupying valuable dashboard space.

The application should feel branded through:

* typography
* spacing
* layout
* visual discipline

rather than decorative logos.

---

# 30. Design Anti-Patterns

Do NOT introduce:

* excessive rounded corners
* excessive gradients
* neon colors
* glassmorphism
* giant shadows
* generic dashboard cards
* multiple font families
* oversized buttons
* excessive badges
* decorative illustrations
* animated backgrounds
* excessive chart junk
* unnecessary sidebars
* excessive whitespace that hurts information density
* AI-dashboard aesthetics
* generic Bootstrap-like styling

---

# 31. Design Quality Bar

Before considering a UI section complete, ask:

### Does it look premium without decoration?

### Is the information hierarchy immediately obvious?

### Are numbers easy to scan?

### Does the typography feel intentional?

### Are neutral colors doing most of the work?

### Are borders and spacing providing structure?

### Are rounded corners being used sparingly?

### Does the interface feel like one coherent product?

### Would this look credible on a large screen during a live competition?

If the answer is no, refine the design rather than adding more decoration.

---

# 32. Overall Visual Target

The final product should feel like:

**A financial trading terminal designed by an editorial design studio.**

Not:

**A college project dashboard.**

The design should be restrained enough that the competition mechanics become the visual focus.

The two-font system, neutral palette, sharp geometry, strong grid, typography, and numerical hierarchy should carry the entire visual identity.
