# SANDBOX — UI Design System

## 1. Design Direction

SANDBOX should feel like a **modern, premium product interface** with the visual discipline of shadcn/ui.

Target:
- Clean
- Minimal
- Modern
- Precise
- Premium
- Calm
- Functional
- Editorial without feeling old-fashioned

Think **shadcn/ui + modern fintech + understated editorial design**.

The interface should feel intentionally designed, not like a generic dashboard template.

Visual hierarchy comes from:
1. Typography
2. Spacing
3. Grid
4. Borders
5. Surface contrast
6. Subtle state colors
7. Small, purposeful motion

Avoid decorative effects as a substitute for hierarchy.

---

## 2. Typography

Use exactly **two font families**.

### Primary — Geist Sans

Use Geist Sans for almost the entire application:
- navigation
- buttons
- tables
- stock names
- prices
- portfolio values
- timers
- labels
- forms
- admin controls
- participant dashboard
- body text
- status indicators

Do not use a monospace font for financial data. Use weight, alignment, spacing, and tabular numerals where available.

### Secondary — EB Garamond

Use EB Garamond sparingly for:
- SANDBOX wordmark
- homepage hero headline
- major editorial statements
- occasional large section titles

Do not use EB Garamond for tables, buttons, navigation, or dense application UI.

The visual identity should feel contemporary rather than like an old financial terminal.

---

## 3. Color System

Use a refined neutral palette inspired by modern shadcn interfaces.

### Dark theme

```text
Background:        #09090B
Foreground:        #FAFAFA
Card / Surface:    #0F0F11
Elevated Surface:  #141416
Muted Foreground:  #A1A1AA
Subtle Foreground: #71717A
Border:            #27272A
Subtle Border:     #1F1F22
Input Background:  #0C0C0E
```

Use a deep neutral background rather than pure black.

Use soft off-white text rather than pure white everywhere.

### Optional light theme

```text
Background:        #FAFAFA
Foreground:        #18181B
Card / Surface:    #FFFFFF
Muted Foreground:  #71717A
Border:            #E4E4E7
Input Background:  #FFFFFF
```

Keep light and dark themes structurally consistent.

---

## 4. Accent Colors

The interface should remain overwhelmingly neutral.

Use color to communicate meaning:

Positive:
```text
#22C55E
```

Negative:
```text
#EF4444
```

Warning:
```text
#F59E0B
```

Use these only for:
- gains/losses
- market movement
- warnings
- paused states
- successful/destructive actions

Do not use accent colors decoratively throughout the UI.

---

## 5. Radius

Use modern shadcn-style geometry while keeping it controlled.

Default radius: **6px**

Use:
- 4px for dense controls
- 6px for standard controls
- 8px for dialogs/larger surfaces
- 10–12px only where genuinely useful

Avoid excessive pill-shaped components.

Reserve `rounded-full` for genuinely circular elements such as avatars/status indicators.

---

## 6. Borders and Shadows

Use borders as a primary structural tool.

Border:
```text
#27272A
```

Prefer:
- subtle borders
- separators
- surface contrast
- spacing

Use very few shadows.

If shadows are needed for dialogs, popovers, or menus, keep them subtle.

Do not give every card a shadow.

---

## 7. Shadcn/ui

Use **shadcn/ui** as the component foundation.

Prefer:
- Button
- Input
- Label
- Dialog
- AlertDialog
- Select
- DropdownMenu
- Tabs
- Table
- Badge
- Tooltip
- Popover
- Sheet
- Separator
- Skeleton
- ScrollArea
- Sonner
- Command

Customize shadcn components to match this design system.

Do not leave the default shadcn aesthetic untouched.

The final interface should feel like **SANDBOX built with shadcn**, not a default shadcn template.

---

## 8. Dashboard Layout

The participant dashboard should feel like a modern financial workspace.

Prioritize:
- current round
- timer
- market status
- cash
- portfolio value
- P/L
- market
- holdings
- leaderboard
- transaction history

Use a responsive grid with clear alignment.

Avoid turning every section into a floating card.

---

## 9. Header

Keep the header compact.

Example:

```text
SANDBOX          ROUND 02     08:42     MARKET OPEN     TEAM ALPHA
```

SANDBOX uses EB Garamond.

Everything else uses Geist Sans.

Use a subtle bottom border.

---

## 10. Timer

The timer is important but should not dominate.

Example:

```text
ROUND 02
08:42
```

Use Geist Sans with strong weight.

Near the end, subtly transition into the warning color.

At zero:

```text
00:00
ROUND ENDED
```

---

## 11. Market Table

Use shadcn's Table component.

Columns:
- Company
- Symbol
- Price
- Change
- Change %
- Owned
- Action

Use:
- compact rows
- subtle separators
- hover states
- right-aligned numeric columns
- consistent column widths

Do not overuse badges or icons.

---

## 12. Trading Dialog

Use shadcn Dialog.

Keep it compact and clean.

Example:

```text
BUY RELIANCE

Current Price
₹2,840

Quantity
[ − ] 10 [ + ]

Estimated Total
₹28,400

Available Cash
₹42,500

[CANCEL]    [BUY]
```

Do not make it look like a generic SaaS modal.

---

## 13. Portfolio Summary

Make these immediately visible:

```text
PORTFOLIO VALUE
₹1,18,420

CASH
₹42,500

TOTAL P/L
+₹18,420
```

Use large Geist Sans, strong weight, tight hierarchy, and restrained state colors.

---

## 14. Leaderboard

Keep it competitive but sophisticated.

```text
LIVE LEADERBOARD

#   TEAM             VALUE              P/L

1   Alpha            ₹1,42,300          +₹42,300
2   Sigma            ₹1,38,920          +₹38,920
3   Phoenix          ₹1,29,440          +₹29,440
```

Highlight the current team subtly.

Avoid podium graphics, trophies, neon rankings, and gold gradients.

---

## 15. Admin Interface

The admin interface should feel like a professional operations console.

Primary sections:
- Competition
- Market
- Price Editor
- Videos
- Dividends
- Leaderboard

Use shadcn Tabs or compact navigation where appropriate.

Avoid huge sidebars.

---

## 16. Price Editor

Make the price editor one of the strongest components.

```text
PRICE EDITOR

COMPANY       CURRENT       NEW PRICE       CHANGE

RELIANCE      ₹2,500        ₹2,800          +₹300
TCS           ₹3,400        ₹3,100          -₹300
INFY          ₹1,600        ₹1,900          +₹300

3 PENDING CHANGES

[ APPLY PRICE CHANGES ]
```

Pending values must be visually distinct from actual market prices.

Participants must never see pending prices.

---

## 17. Admin Controls

Group controls logically:

### Round
```text
START ROUND
END ROUND
```

### Market
```text
OPEN MARKET
CLOSE MARKET
```

### Trading
```text
PAUSE TRADING
RESUME TRADING
```

### Market Updates
```text
APPLY PRICE CHANGES
```

### Video
```text
PLAY VIDEO
```

### Dividends
```text
PAY DIVIDEND
```

### Competition
```text
RESET COMPETITION
```

Use AlertDialog for destructive actions.

---

## 18. Homepage

Keep the homepage minimal and premium.

Suggested structure:

```text
SANDBOX

A live market simulation
built for competition.

Trade.
React.
Compete.

[ PARTICIPANT LOGIN ]
[ ADMIN SIGN IN ]
```

Use EB Garamond for the hero statement and Geist Sans for supporting text and controls.

Avoid stock photography, giant gradients, generic illustrations, and bloated marketing sections.

---

## 19. Authentication Pages

Participant login and admin sign-in should feel like part of SANDBOX.

Keep them minimal.

Use shadcn Input, Label, Button, and validation components.

Do not use a generic authentication template.

---

## 20. Status Indicators

Use compact indicators:

```text
● MARKET OPEN
● TRADING PAUSED
● MARKET CLOSED
```

Use color plus text. Never rely on color alone.

---

## 21. Motion

Use subtle modern motion:
- dialog transitions
- hover transitions
- price update highlights
- leaderboard movement
- button loading
- video overlay transitions
- toast appearance

Avoid bouncing, parallax, animated backgrounds, constant floating elements, and long transitions.

The UI should feel fast.

---

## 22. Price Updates

When a price changes:

```text
₹2,500 → ₹2,800
```

briefly highlight the changed value.

Use green/red only when direction is meaningful.

Do not flash entire tables.

---

## 23. Responsive Design

Desktop is primary.

Optimize for:
- 1280px
- 1440px
- 1920px

At smaller widths:
- preserve timer
- preserve portfolio value
- preserve market status
- preserve trading controls
- allow tables to scroll
- collapse secondary sections

Do not blindly stack everything into giant cards.

---

## 24. Icons

Use Lucide React.

Icons should be:
- small
- subtle
- functional
- consistent

Do not put icons beside every label.

---

## 25. Accessibility

Use shadcn/Radix primitives wherever possible.

Ensure:
- keyboard navigation
- visible focus states
- semantic buttons
- accessible dialogs
- accessible labels
- sufficient contrast
- state information isn't communicated by color alone

---

## 26. Spacing

Use a consistent 4px-based spacing system:

```text
4
8
12
16
20
24
32
40
48
64
```

Avoid arbitrary spacing unless necessary.

---

## 27. Design Tokens

Centralize all visual tokens using CSS variables / Tailwind theme tokens.

Do not scatter raw colors throughout components.

The entire design should be adjustable from one place.

---

## 28. Anti-Patterns

Do NOT introduce:
- monospace fonts
- excessive rounded corners
- excessive pill components
- neon colors
- glassmorphism
- giant gradients
- heavy shadows
- generic SaaS cards everywhere
- oversized dashboard widgets
- excessive icons
- decorative illustrations
- excessive animations
- huge sidebars
- random colors
- inconsistent spacing
- multiple competing design systems
- default shadcn styling without customization

---

## 29. Quality Bar

Before considering a section complete, ask:

- Does it feel modern?
- Does it feel clean?
- Does it feel like one coherent product?
- Is hierarchy immediately obvious?
- Are financial numbers easy to scan without monospace?
- Is the interface mostly neutral?
- Are surfaces and borders subtle?
- Are components compact and purposeful?
- Does shadcn feel integrated rather than pasted in?
- Does it look credible as a real financial competition product?

If not, refine hierarchy, spacing, typography, or surfaces before adding decoration.

---

## 30. Final Visual Target

The final SANDBOX interface should feel like:

**shadcn/ui meets modern fintech meets understated editorial design.**

Key ingredients:

```text
Geist Sans
+
EB Garamond
+
#09090B / #FAFAFA neutral palette
+
subtle #27272A borders
+
6px default radius
+
clean shadcn primitives
+
strong spacing
+
minimal motion
+
restrained state colors
```

The product should look modern and premium because of its **design discipline**, not visual effects.
