# AID 2026 Product and Design System

## Product idea

**Calm urgency.** AID is a two-sided roadside-assistance product. It should reduce decisions for a stranded customer and make the next operational action unmistakable for a driver.

## Purple brand direction

- **Primary:** AID violet (`#8B5CF6`) for primary actions and active navigation.
- **Bright accent:** Lavender (`#A78BFA`) for emphasis, route cues, and selected states.
- **Foundation:** Aubergine (`#0D0914`), deep plum (`#1C1529`), and raised plum (`#241B35`).
- **Text:** Soft white (`#F8F6FF`) with mauve-gray (`#AAA2B8`) support text.
- **Semantic status colors remain distinct:** green for ready/success, amber for warning/verification, and red for danger/destructive actions.
- Purple is the shared AID identity for both customers and drivers; the interfaces differ through hierarchy and content, not conflicting role colors.
- Avoid decorative maps, excessive glass blur, gratuitous glow, and gradients that compete with urgent actions.

## Core tokens

Tokens live in `src/rebrand.css`.

| Token | Value | Use |
| --- | --- | --- |
| `--aid-ink` | `#0D0914` | App background |
| `--aid-panel` | `#1C1529` | Cards and controls |
| `--aid-panel-raised` | `#241B35` | Elevated/interactive panels |
| `--aid-ivory` | `#F8F6FF` | Primary text |
| `--aid-muted` | `#AAA2B8` | Supporting text |
| `--aid-signal` | `#8B5CF6` | Primary CTA and active navigation |
| `--aid-signal-strong` | `#A78BFA` | Highlight and selected state |
| `--aid-danger` | `#FF6B5F` | Emergency/destructive state |

## Product hierarchy

### Customer

1. **Help:** active request first, then location confirmation and symptom-first roadside choices.
2. **Activity:** request history, receipts, cancellations, and completed service.
3. **Account:** identity, vehicles, saved places, payments, privacy, and support.
4. **Communication:** messages and calls are contextual to an active request rather than a permanent primary tab.
5. Planned car-care services are secondary to immediate roadside assistance.

### Driver

1. **Work availability:** verified drivers can go online; unverified drivers are gated.
2. **Active job:** current work outranks all other dashboard content.
3. **Incoming requests:** service, customer, location, price, and accept/decline actions.
4. **Today:** earnings, completed jobs, and rating.
5. **Driver readiness:** verification and account standing.

## Interaction rules

- Minimum interactive target: 44pt on iOS and approximately 48dp on Android where practical.
- One dominant violet action per decision area.
- Do not use color alone to communicate status; pair it with text and iconography.
- Confirm location before dispatch and explain that request details can be reviewed before sending.
- Keep emergency-service guidance distinct from roadside support.
- Active bookings must always have a clear route to tracking and communication.
- Respect native safe areas and `prefers-reduced-motion`.

## Shared implementation

- `src/components/brand/AidBrand.tsx` — shared AID mark.
- `src/components/auth/AuthPortal.tsx` — unified authentication shell.
- `src/components/ui/BottomNav.tsx` — customer Help, Activity, and Account navigation.
- `src/screens/HomeScreen.tsx` — symptom-first customer assistance layout.
- `src/screens/driver/DriverHomeScreen.tsx` — driver work dashboard with verification gating.
- `src/rebrand.css` — tokens, responsive layouts, native safe areas, and both role systems.

## Native behavior

- Content respects iOS status/Dynamic Island and home-indicator safe areas.
- Bottom navigation includes `env(safe-area-inset-bottom)`.
- Auth and first-run surfaces remain scrollable on short screens.
- Web previews are constrained to a 430px native canvas; native devices use the full viewport.
- Production verification must include iPhone and Android simulator/device widths, text scaling, keyboard states, permissions, and reduced motion.

## Product gaps outside this layout phase

Store readiness still depends on production authentication and storage, server-backed dispatch and chat, payment authorization, production maps and location tracking, push notifications, account deletion, privacy/support content, signing, and Android native validation. See `STORE_RELEASE_ROADMAP.md`.
