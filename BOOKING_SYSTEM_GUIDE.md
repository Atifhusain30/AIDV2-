# AID App - Booking System Guide

This document explains the booking system architecture and how to verify it works correctly.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Booking Flow](#booking-flow)
4. [Data Types](#data-types)
5. [Store Actions](#store-actions)
6. [Status Progression](#status-progression)
7. [Testing the System](#testing-the-system)
8. [Troubleshooting](#troubleshooting)

---

## Overview

The booking system enables users to:
- Request roadside assistance services (battery jump, towing, EV charging, etc.)
- Track their service request in real-time via the Chat screen
- View booking history with all past and active requests

**Key Files:**
| File | Purpose |
|------|---------|
| `src/store/useAppStore.ts` | Zustand store with booking state & actions |
| `src/types/index.ts` | TypeScript types for `Booking`, `BookingStatus`, etc. |
| `src/components/modals/ServicesModal.tsx` | Main service request modal |
| `src/components/modals/TowingModal.tsx` | Towing-specific request modal |
| `src/components/modals/EVChargingModal.tsx` | EV charging request modal |
| `src/screens/ChatScreen.tsx` | Real-time booking tracking & chat |
| `src/screens/HistoryScreen.tsx` | Booking history view |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Zustand Store                            │
│  ┌─────────────────┐    ┌─────────────────────────────────┐    │
│  │  activeBooking  │    │       bookingHistory[]          │    │
│  │  (Booking|null) │    │  (most recent first)            │    │
│  └────────┬────────┘    └────────────────┬────────────────┘    │
│           │                              │                      │
│           ▼                              ▼                      │
│  setActiveBooking()           addToBookingHistory()             │
│  updateActiveBookingStatus()  updateBookingInHistory()          │
│  clearActiveBooking()                                           │
└─────────────────────────────────────────────────────────────────┘
                    │                       │
         ┌──────────┴──────────┐   ┌───────┴───────┐
         ▼                     ▼   ▼               ▼
   ┌───────────┐         ┌───────────┐      ┌───────────┐
   │ ChatScreen│         │ServicesModal│    │HistoryScreen│
   │           │         │TowingModal  │    │           │
   │ - Shows   │         │EVChargingModal│  │ - Lists   │
   │   active  │         │             │    │   all     │
   │   booking │         │ - Creates   │    │   bookings│
   │ - Status  │         │   booking   │    │ - Click   │
   │   updates │         │ - Saves to  │    │   to view │
   └───────────┘         │   store     │    └───────────┘
                         └─────────────┘
```

---

## Booking Flow

### Step 1: User Requests Service

1. User opens a service modal (Services, Towing, or EV Charging)
2. User fills in the required form fields
3. User clicks "Request Service" / "Request Tow" / "Request Charging"

### Step 2: Booking Created

When the submit handler fires:

```typescript
// 1. Create booking object
const booking: Booking = {
  id: crypto.randomUUID(),        // Unique identifier
  customerId: 'demo_user',
  service: selectedService,        // Service object with id, name, price
  status: 'searching',             // Initial status
  location: {
    address: 'Current Location',
    lat: userLocation.lat,
    lng: userLocation.lng,
  },
  estimatedPrice: estimate?.total || 50,
  notes: formData.notes,
  createdAt: new Date(),
}

// 2. Save to store
setActiveBooking(booking)          // Set as current active booking
addToBookingHistory(booking)       // Add to history array (prepended)
```

### Step 3: Navigate to Chat

After the success animation:
```typescript
setActiveModal(null)       // Close modal
resetModalStep()           // Reset form wizard
setCurrentScreen('chat')   // Navigate to Chat tab
```

### Step 4: Status Progression

The ChatScreen simulates status changes using `useEffect` timers:

```
searching → accepted → en_route → arrived
   │          │          │          │
   └── 2.5s ──┘── 3s ────┘── 4s ────┘
```

Each transition:
- Updates `activeBooking.status` via `updateActiveBookingStatus()`
- Syncs the change to `bookingHistory` automatically
- Adds a system message to the chat

### Step 5: View in History

The HistoryScreen reads from `bookingHistory`:
- Shows all bookings sorted by date (newest first)
- Clicking an active booking sets it as `activeBooking` and navigates to Chat

---

## Data Types

### BookingStatus

```typescript
type BookingStatus = 
  | 'pending'       // Request created, waiting
  | 'searching'     // Actively finding provider
  | 'accepted'      // Provider accepted the job
  | 'en_route'      // Provider traveling to location
  | 'arrived'       // Provider at location
  | 'in_progress'   // Service being performed
  | 'completed'     // Service finished
  | 'cancelled'     // Request cancelled
```

### Booking Interface

```typescript
interface Booking {
  id: string                    // Unique UUID
  customerId: string            // User identifier
  driverId?: string             // Assigned driver ID
  service: Service              // Service details (id, name, price, etc.)
  status: BookingStatus         // Current status
  mechanic?: Mechanic           // Assigned provider info
  vehicle?: Vehicle             // Customer's vehicle
  location: {                   // Service location
    address: string
    lat: number
    lng: number
  }
  dropoffLocation?: {...}       // For towing services
  estimatedPrice: number        // Price estimate
  finalPrice?: number           // Actual price (after completion)
  estimatedArrival?: number     // ETA in minutes
  payment?: {...}               // Payment details
  driverLocation?: Location     // Real-time driver position
  notes?: string                // Customer notes
  createdAt: Date               // Timestamp
  acceptedAt?: Date
  completedAt?: Date
}
```

---

## Store Actions

### Reading State

```typescript
const { activeBooking, bookingHistory } = useAppStore()
```

### Modifying State

| Action | Description |
|--------|-------------|
| `setActiveBooking(booking)` | Set or clear the active booking |
| `addToBookingHistory(booking)` | Add a new booking (prepends to array) |
| `updateActiveBookingStatus(status, updates?)` | Update status + optional fields, syncs to history |
| `updateBookingInHistory(id, updates)` | Update a specific booking in history |
| `clearActiveBooking()` | Set `activeBooking` to `null` |

### Example: Update Status with Provider Info

```typescript
updateActiveBookingStatus('accepted', {
  mechanic: {
    id: 'prov_123',
    name: 'Mike Rodriguez',
    initials: 'MR',
    rating: 4.9,
    // ...
  },
  estimatedArrival: 8,
})
```

### Cancel / Complete Booking

The ChatScreen provides two action buttons for active bookings:

**Cancel Request:**
```typescript
const handleCancelRequest = () => {
  if (!activeBooking) return
  const bookingId = activeBooking.id
  updateBookingInHistory(bookingId, { status: 'cancelled' })
  clearActiveBooking()
}
```

**Mark Completed:**
```typescript
const handleMarkCompleted = () => {
  if (!activeBooking) return
  const bookingId = activeBooking.id
  updateBookingInHistory(bookingId, { status: 'completed', completedAt: new Date() })
  clearActiveBooking()
}
```

Both actions:
1. Update the booking status in `bookingHistory`
2. Clear `activeBooking` (returns Chat to empty state)
3. Changes persist across reload

### Rebook from History

Create a new booking based on a previous one:

```typescript
const handleRebook = (bookingId: string) => {
  rebookFromHistory(bookingId)
  setCurrentScreen('chat')
}
```

The `rebookFromHistory` action:
1. Finds the original booking in history
2. Creates a new booking with:
   - New `id` (crypto.randomUUID())
   - New `createdAt` (current timestamp)
   - Status reset to `'searching'`
   - Provider fields cleared (mechanic, driverId, estimatedArrival, etc.)
   - Service, location, price, notes preserved
3. Sets it as `activeBooking`
4. Prepends it to `bookingHistory` (newest first)

### Provider Matching

When a booking transitions from `searching` → `accepted`, a provider is automatically assigned:

```typescript
// Called when status changes to 'accepted'
matchProviderForBooking(bookingId)
```

The `matchProviderForBooking` action:
1. Picks a provider from `state.mechanics[]` (random selection)
2. If no mechanics available, creates a fallback provider (`AID Pro #XXX`)
3. Updates both `activeBooking` and `bookingHistory` with:
   - `mechanic` - Full mechanic object (id, name, initials, rating, eta, etc.)
   - `driverId` - The mechanic's ID
   - `estimatedArrival` - ETA in minutes
   - `acceptedAt` - Timestamp

**Provider Info includes:**
- `id` - Unique identifier
- `name` - Full name (e.g., "Mike Rodriguez")
- `initials` - Two-letter initials (e.g., "MR")
- `rating` - Star rating (e.g., 4.9)
- `eta` - Estimated time of arrival in minutes

**Where provider is displayed:**
- Chat screen: Provider card with name, rating, ETA
- History (collapsed): Provider name next to status badge
- History (expanded): Full provider card with initials, name, rating

### Chat Messages & Provider Replies

Chat messages are persisted per booking in `bookingMessages[bookingId]`:

```typescript
// ChatMessage type
interface ChatMessage {
  id: string
  bookingId: string
  sender: 'user' | 'provider' | 'system'
  text: string
  timestamp: string // ISO string
  meta?: {
    kind?: 'user_message' | 'provider_intro' | 'provider_auto_reply' | 'status_update'
  }
}

// Append a message
appendMessage(bookingId, {
  sender: 'user',
  text: 'On my way!',
  meta: { kind: 'user_message' },
})

// Check if intro message exists
hasProviderIntroMessage(bookingId) // returns boolean
```

**Provider Reply Triggers:**
1. **Provider Intro** - When booking transitions to 'accepted' and provider is matched:
   - System message: "[Provider] accepted your request"
   - Provider intro (1-3s delay): "Hey! This is {name}. I'm on my way. ETA ~{eta} minutes."
2. **Auto Replies** - When user sends a message (70% chance):
   - Provider replies (1-3s delay) with varied responses
   - Typing indicator shown while waiting

**Reply Templates:**
- Intro: "Hey! This is {providerName}...", "{providerName} here — heading to you now..."
- Auto: "Got it 👍", "On it — see you soon.", "Thanks! I'm about {eta} minutes away."

**Persistence:**
- All messages persist across refresh/restart
- Messages are stored in `bookingMessages` (part of persisted state)
- No replies sent for cancelled/completed bookings

### Booking Detail Modal

View full booking details from History or Chat with a modal overlay:

```typescript
// Open detail modal
openBookingDetail(bookingId)

// Close detail modal
closeBookingDetail()
```

**How to Access:**
- Tap any booking card in History → Opens detail modal
- Tap "Details" button in Chat header → Opens detail modal

**Detail Modal Contents:**
1. **Service Summary** - Type, status badge, price
2. **Provider Card** - Name, initials, rating, ETA (if assigned)
3. **Status Stepper** - Visual timeline showing booking progress
4. **Details List** - Location, created date/time, notes, completed date

**Available Actions:**
- **Resume Chat** - Sets booking as active and navigates to Chat
- **Rebook** - Creates new booking from this one
- **Support** - Opens Emergency SOS modal

**State:**
- `selectedBookingId` - Currently viewed booking (UI-only, not persisted)
- Modal renders globally in `CustomerApp` (App.tsx)

### Local Push Notifications

Push notifications alert users when booking status changes:

**Setup:**
- Uses `@capacitor/local-notifications` plugin
- Initialized on app start via `initNotifications()`
- Works on iOS/Android; gracefully no-ops on web

**Notification Triggers:**
- `accepted` - "Provider accepted ✅" with ETA
- `en_route` - "On the way 🚗"
- `arrived` - "Arrived 📍"
- `completed` - "Completed 🎉"
- `cancelled` - "Cancelled"

**Duplicate Prevention:**
- `lastNotifiedStatusByBooking` tracks last notified status per booking
- Persisted in localStorage
- Prevents re-notifying same status after app restart

**Files:**
- `src/lib/notifications.ts` - Helper module
- `src/store/useAppStore.ts` - Tracking state
- `src/screens/ChatScreen.tsx` - Triggers on status change
- `src/App.tsx` - Initialization

```typescript
// Trigger notification (internal use)
await notifyBookingUpdate({
  bookingId: '...',
  status: 'accepted',
  title: 'Provider accepted ✅',
  body: 'Mike R. accepted your Oil Change request. ETA 8 min.',
})

// Get notification template
const template = getNotificationTemplate(
  status,
  serviceType,
  providerName,
  providerETA
)
```

**Notification Tap Handling:**

When user taps a notification, the app opens the corresponding booking:

```typescript
// Register tap handler (called once in App.tsx)
registerNotificationTapHandler((bookingId) => {
  useAppStore.getState().openBookingDetailFromNotification(bookingId)
})
```

**`openBookingDetailFromNotification(bookingId)`** behavior:
1. Finds booking in `bookingHistory` by ID
2. If found: Opens BookingDetailModal + navigates to History
3. If not found: Navigates to History screen (fallback)

**Flow:**
```
User taps notification
  ↓
localNotificationActionPerformed event
  ↓
Extract bookingId from extra
  ↓
openBookingDetailFromNotification(bookingId)
  ↓
BookingDetailModal opens → "Resume Chat" available
```

---

## Status Progression

The ChatScreen automatically progresses status for demo purposes:

| From | To | Delay | What Happens |
|------|----|-------|--------------|
| `searching` | `accepted` | 2.5s | Provider assigned, system message added |
| `accepted` | `en_route` | 3s | "Provider is on their way" message |
| `en_route` | `arrived` | 4s | "Provider has arrived" message |

**To customize timing**, edit `ChatScreen.tsx`:

```typescript
// In the useEffect that handles status progression
if (activeBooking.status === 'searching') {
  const t1 = setTimeout(() => {
    // ... transition to 'accepted'
  }, 2500) // ← Change this value
  timers.push(t1)
}
```

---

## Testing the System

### Manual Testing Checklist

#### ✅ Test 1: Create Booking from Services Modal

1. Open the app (`npm run dev`)
2. Click a service card (e.g., "Battery Jump")
3. Fill in the form details
4. Click "Get Estimate" → "Request Service"
5. **Verify:**
   - Success animation appears
   - "Track Service" button appears
6. Click "Track Service"
7. **Verify:**
   - Chat screen opens
   - Booking info card shows service name, status, price
   - Status starts as "Finding Provider..."

#### ✅ Test 2: Status Progression

1. After creating a booking, stay on Chat screen
2. **Watch for these transitions:**
   - ~2.5s: Status changes to "Provider Accepted", provider card appears
   - ~5.5s: Status changes to "On The Way"
   - ~9.5s: Status changes to "Provider Arrived"
3. **Verify:**
   - System messages appear for each transition
   - Progress dots update correctly
   - Provider info card shows name, vehicle, rating

#### ✅ Test 3: Chat Functionality

1. After a provider is assigned, the chat input is enabled
2. Type a message and send
3. **Verify:**
   - Message appears with "sending" → "sent" → "delivered" → "read" states
   - Provider may respond automatically (simulated)
   - Quick action buttons work

#### ✅ Test 4: History Screen

1. Navigate to the History tab
2. **Verify:**
   - Stats show correct Completed/Active/Total counts
   - Your booking appears in the list
   - Status badge is correct
3. Expand a booking card
4. **Verify:**
   - Details show (location, date, time)
   - "Track Service" button appears for active bookings
5. Click "Track Service"
6. **Verify:**
   - Navigates to Chat with that booking loaded

#### ✅ Test 5: Empty States

1. Clear all bookings (or use fresh browser/incognito)
2. Navigate to Chat tab
3. **Verify:**
   - "No Active Request" message
   - "Request Service" button works
4. Navigate to History tab
5. **Verify:**
   - "No Bookings Yet" message
   - "Request Service" button works

#### ✅ Test 6: Multiple Bookings

1. Create a booking, wait for it to progress to "arrived"
2. Create another booking
3. **Verify:**
   - New booking becomes activeBooking
   - Both bookings appear in History
   - Clicking old booking in History loads it in Chat

#### ✅ Test 7: Persistence (After Page Refresh)

1. Create a booking via Services modal
2. Wait for status to progress to "accepted"
3. **Refresh the page** (F5 or Ctrl+R)
4. **Verify:**
   - Chat screen still shows the activeBooking
   - Status is preserved (should still be "accepted" or later)
   - History tab shows the booking
5. Navigate to History tab
6. **Verify:**
   - Booking still exists in list
   - All details (service type, price, status) are preserved

#### ✅ Test 8: clearBookings Action

1. Create one or more bookings
2. Open browser DevTools Console
3. Run: `useAppStore.getState().clearBookings()`
4. **Verify:**
   - Chat shows empty state ("No Active Request")
   - History shows empty state ("No Bookings Yet")
5. Refresh the page
6. **Verify:**
   - Data remains cleared (persistence updated)

#### ✅ Test 9: Cancel Request

1. Create a booking via Services modal
2. On Chat screen, observe the "Cancel Request" and "Mark Completed" buttons
3. Click "Cancel Request"
4. **Verify:**
   - Chat returns to empty state ("No Active Request")
   - Navigate to History tab
   - Booking shows status "Cancelled" (red badge)
5. Refresh the page
6. **Verify:**
   - Booking still shows as "Cancelled" in History

#### ✅ Test 10: Mark Completed

1. Create a booking via Services modal
2. Wait for status to progress to "accepted" or later
3. Click "Mark Completed"
4. **Verify:**
   - Chat returns to empty state
   - Navigate to History tab
   - Booking shows status "Completed" (green badge)
5. Refresh the page
6. **Verify:**
   - Booking still shows as "Completed" in History

#### ✅ Test 11: Timers Stop on Terminal State

1. Create a booking (status: "searching")
2. Immediately click "Cancel Request"
3. **Verify:**
   - Status does NOT progress to "accepted" after 2.5s
   - Booking remains "cancelled"

#### ✅ Test 12: Rebook from History

1. Create and complete (or cancel) a booking
2. Navigate to History tab
3. Expand a booking card
4. Click "Rebook" button
5. **Verify:**
   - App navigates to Chat
   - New booking appears with status "Searching"
   - New booking has different ID and new timestamp
   - Service type, location, and price are preserved
6. Navigate to History tab
7. **Verify:**
   - New booking appears at the TOP of the list
   - Original booking still exists below it
8. Refresh the page
9. **Verify:**
   - Both bookings persist correctly
   - New booking is still at top

#### ✅ Test 13: Provider Matching

1. Create a new booking (status: "searching")
2. Wait ~2.5 seconds for status to change to "accepted"
3. **Verify in Chat:**
   - Provider card appears with name, rating, ETA
   - System message: "[Provider Name] accepted your request"
   - Provider welcome message appears
4. Navigate to History tab
5. **Verify:**
   - Booking shows provider name next to status badge
   - Expand card to see full provider info (initials, rating)
6. Refresh the page
7. **Verify:**
   - Provider info persists (name, rating, ETA still visible)
   - Chat still shows provider card
8. Create new booking via Rebook
9. **Verify:**
   - New booking has NO provider until "accepted"
   - Provider from old booking is NOT copied

#### ✅ Test 14: Provider Replies & Message Persistence

1. Create a booking and wait for provider to be assigned
2. **Verify intro message:**
   - System message: "[Provider] accepted your request"
   - Provider intro message appears (1-3s delay)
   - Typing indicator shown while waiting
3. Send a user message (e.g., "On my way")
4. **Verify auto reply:**
   - Your message appears immediately
   - Typing indicator appears
   - Provider reply appears (1-3s delay, 70% chance)
5. Refresh the page
6. **Verify persistence:**
   - All messages still visible (system, provider intro, user, provider replies)
   - Messages in correct order
7. Send another message
8. **Verify:**
   - New messages work after reload
   - Provider may reply again
9. Cancel the booking
10. **Verify:**
    - No more provider replies after cancellation
    - Navigate to History, messages not visible (separate booking thread)

#### ✅ Test 15: Booking Detail Modal

1. Navigate to History tab
2. Tap any booking card
3. **Verify modal opens with:**
   - Service type and status badge
   - Price displayed
   - Provider card (if assigned) with name, rating, ETA
   - Status stepper showing progress
   - Location, date/time, notes
4. Tap "Resume Chat" button
5. **Verify:**
   - Modal closes
   - Chat screen opens with that booking
6. Go back to History, tap another booking
7. Tap "Rebook" button
8. **Verify:**
   - Modal closes
   - New booking created (searching status)
   - Chat opens with new booking
9. Open detail modal again, tap "Support"
10. **Verify:**
    - Detail modal closes
    - Emergency SOS modal opens
11. Navigate to Chat (with active booking)
12. Tap "Details" button in header
13. **Verify:**
    - Detail modal opens for current booking

#### ✅ Test 16: Push Notifications

1. **On Web (dev mode):**
   - Open browser console
   - Create a new booking
   - Watch for `[Notifications] Would notify:` logs
   - Status changes should log notification attempts
2. **On iOS/Android:**
   - Grant notification permission on first app load
   - Create a new booking
   - Wait for status to change to "accepted"
   - **Verify:** Notification appears: "Provider accepted ✅"
   - Wait for "en_route"
   - **Verify:** Notification: "On the way 🚗"
   - Wait for "arrived"
   - **Verify:** Notification: "Arrived 📍"
3. **Duplicate Prevention:**
   - Create booking, let it reach "accepted"
   - Refresh the app
   - **Verify:** NO duplicate "accepted" notification fires
4. **Cancel flow:**
   - Create booking, cancel it
   - **Verify:** Notification: "Cancelled"
5. **Complete flow:**
   - Create booking, mark as completed
   - **Verify:** Notification: "Completed 🎉"

#### ✅ Test 17: Notification Tap Navigation

1. **On iOS/Android:**
   - Create a booking and let it reach "accepted"
   - Notification appears
   - Background the app (or close it)
   - Tap the notification
2. **Verify:**
   - App opens/resumes
   - BookingDetailModal opens for the tapped booking
   - Booking details visible (service, provider, status)
3. Tap "Resume Chat"
4. **Verify:**
   - Modal closes
   - Chat opens with correct booking thread
5. **Edge case - booking not found:**
   - If notification bookingId doesn't exist in history
   - **Verify:** App opens to History screen (fallback)
6. **On Web:**
   - No crash, graceful no-op
   - Console logs: `[Notifications] Tap handler not registered (web mode)`

### Automated Testing (Optional)

Add to your test suite:

```typescript
import { useAppStore } from './store/useAppStore'

describe('Booking System', () => {
  beforeEach(() => {
    useAppStore.setState({ 
      activeBooking: null, 
      bookingHistory: [] 
    })
  })

  it('creates a booking', () => {
    const { setActiveBooking, addToBookingHistory, activeBooking, bookingHistory } = useAppStore.getState()
    
    const booking = {
      id: 'test-123',
      customerId: 'user-1',
      service: { id: 'battery_jump', name: 'Battery Jump', basePrice: 45, estimatedTime: 15 },
      status: 'searching',
      location: { address: 'Test', lat: 0, lng: 0 },
      estimatedPrice: 45,
      createdAt: new Date(),
    }
    
    setActiveBooking(booking)
    addToBookingHistory(booking)
    
    const state = useAppStore.getState()
    expect(state.activeBooking?.id).toBe('test-123')
    expect(state.bookingHistory).toHaveLength(1)
  })

  it('updates booking status', () => {
    const { setActiveBooking, addToBookingHistory, updateActiveBookingStatus } = useAppStore.getState()
    
    const booking = { /* ... */ status: 'searching' }
    setActiveBooking(booking)
    addToBookingHistory(booking)
    
    updateActiveBookingStatus('accepted', { estimatedArrival: 10 })
    
    const state = useAppStore.getState()
    expect(state.activeBooking?.status).toBe('accepted')
    expect(state.activeBooking?.estimatedArrival).toBe(10)
    expect(state.bookingHistory[0].status).toBe('accepted')
  })
})
```

---

## Troubleshooting

### Issue: Booking not appearing in History

**Cause:** `addToBookingHistory()` wasn't called after creating the booking.

**Fix:** Ensure both actions are called:
```typescript
setActiveBooking(booking)
addToBookingHistory(booking) // Don't forget this!
```

### Issue: Status not updating

**Cause:** The `useEffect` in ChatScreen may not be triggering.

**Fix:** Check that `activeBooking?.status` is in the dependency array:
```typescript
useEffect(() => {
  // status progression logic
}, [activeBooking?.status])
```

### Issue: Chat not enabling after provider accepted

**Cause:** `provider` state may not be set.

**Fix:** Ensure `setProvider()` is called when status changes to 'accepted':
```typescript
if (activeBooking.status === 'searching') {
  setTimeout(() => {
    setProvider(simulatedProvider) // ← This is required
    updateActiveBookingStatus('accepted', { ... })
  }, 2500)
}
```

### Issue: Old booking shows in Chat

**Cause:** `activeBooking` wasn't cleared when starting a new booking.

**Fix:** The modal handles this automatically, but you can manually clear:
```typescript
clearActiveBooking() // Before setting new booking
```

### Issue: History not updating when status changes

**Cause:** `updateActiveBookingStatus` should sync to history automatically.

**Check:** The store implementation should include:
```typescript
updateActiveBookingStatus: (status, updates = {}) => set((state) => {
  if (!state.activeBooking) return state
  const updatedBooking = { ...state.activeBooking, status, ...updates }
  return {
    activeBooking: updatedBooking,
    bookingHistory: state.bookingHistory.map(b => 
      b.id === updatedBooking.id ? updatedBooking : b
    )
  }
}),
```

---

## Persistence

Bookings are automatically persisted to `localStorage` using Zustand's persist middleware.

### What's Persisted

| Data | Persisted | Storage Key |
|------|-----------|-------------|
| `activeBooking` | ✅ Yes | `aid-bookings-v1` |
| `bookingHistory` | ✅ Yes | `aid-bookings-v1` |
| Modal state | ❌ No | — |
| Form data | ❌ No | — |
| Loading states | ❌ No | — |
| Notifications | ❌ No | — |

### How It Works

```typescript
// The store uses Zustand persist middleware
export const useAppStore = create<AppState>()(
  persist(
    (set) => ({ /* store implementation */ }),
    {
      name: 'aid-bookings-v1',
      storage: createJSONStorage(() => getStorage()),
      partialize: (state) => ({
        bookingHistory: state.bookingHistory,
        activeBooking: state.activeBooking,
      }),
    }
  )
)
```

### SSR Safety

The store includes a safe storage fallback for:
- Server-side rendering (SSR)
- Private/Incognito mode
- Browsers with localStorage disabled

```typescript
const getStorage = () => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      // Test localStorage availability
      return localStorage
    }
  } catch {
    // Fallback to no-op storage
  }
  return { getItem: () => null, setItem: () => {}, removeItem: () => {} }
}
```

### Clearing Persisted Data

Use the `clearBookings()` action to reset all booking data:

```typescript
const { clearBookings } = useAppStore()
clearBookings() // Clears both activeBooking and bookingHistory
```

Or clear via browser DevTools:
```javascript
localStorage.removeItem('aid-bookings-v1')
```

---

## Location Flow

The app includes a complete location flow that allows users to confirm their location before submitting a booking. Location can be obtained via GPS or entered manually.

### Files

| File | Purpose |
|------|---------|
| `src/lib/geolocation.ts` | Capacitor Geolocation helper (GPS + fallback) |
| `src/lib/geocoding.ts` | Reverse geocoding (coords → address) + address search |
| `src/lib/leafletFix.ts` | Fixes Leaflet marker icons for Vite bundler |
| `src/components/ui/MapPinPicker.tsx` | Interactive map with draggable pin |
| `src/components/modals/LocationConfirmModal.tsx` | Location selection UI |
| `src/store/useAppStore.ts` | Location state management |

### Location State

```typescript
// Types
type GeoCoords = { lat: number; lng: number; accuracy?: number }

// State (persisted)
userLocationLabel: string              // "123 Main St" or "Current location (GPS)"
userCoords: GeoCoords | null           // GPS coordinates if available
locationConfirmedAt: string | null     // ISO timestamp

// Actions
setUserLocationLabel(label: string): void
setUserCoords(coords: GeoCoords | null): void
confirmLocation(label: string, coords?: GeoCoords | null): void
clearConfirmedLocation(): void
```

### User Flow

```
User opens ServicesModal
  ↓
Selects service → fills details → sees estimate
  ↓
Clicks "Request Service"
  ↓
┌───────────────────────────────────────────────────────┐
│ Location confirmed?                                    │
│   NO  → Opens LocationConfirmModal                    │
│           User can:                                    │
│             • Use current GPS location                │
│             • Enter address manually                  │
│           After confirm → returns to ServicesModal    │
│   YES → Creates booking with confirmed location       │
└───────────────────────────────────────────────────────┘
  ↓
Booking created → Chat opens → Provider matching starts
```

### GPS Location

Uses `@capacitor/geolocation` with web fallback:

```typescript
import { getCurrentPosition, getMapsUrl } from './lib/geolocation'

// Get GPS coordinates
try {
  const coords = await getCurrentPosition()
  // { lat: 32.7767, lng: -96.7970, accuracy: 10 }
} catch (error) {
  // Handle permission denied, timeout, etc.
}

// Generate maps URL
const url = getMapsUrl(coords) // "https://www.google.com/maps?q=32.7767,-96.7970"
```

### Reverse Geocoding

Converts GPS coordinates to human-readable addresses using OpenStreetMap Nominatim (free, no API key):

```typescript
import { reverseGeocode } from './lib/geocoding'

// Convert coords to address
try {
  const result = await reverseGeocode(32.7767, -96.7970)
  // result.label = "123 Main St, Dallas, TX 75201"
} catch (error) {
  // Use fallback label: "Current location (GPS)"
}
```

**Features:**
- In-memory caching (avoids repeated API calls for same coords)
- 10-second timeout with AbortController
- Builds clean address from parts (house_number, road, city, state, postcode)
- Falls back to `display_name` if parts unavailable

### Address Search Autocomplete

Search for addresses by text query with autocomplete suggestions:

```typescript
import { searchAddresses, AddressSuggestion } from './lib/geocoding'

// Search for addresses
try {
  const suggestions = await searchAddresses('1600 Pennsylvania', signal)
  // suggestions = [
  //   { id: '123', label: '1600 Pennsylvania Ave, Washington, DC', lat: 38.8977, lng: -77.0365 },
  //   ...
  // ]
} catch (error) {
  // Handle search failure
}
```

**Features:**
- Debounced input (400ms)
- Minimum 3 characters required
- AbortController for canceling in-flight requests
- In-memory caching for repeated queries
- Returns max 6 suggestions with lat/lng

**User Flow:**
```
User types in search box
  ↓
Debounce 400ms
  ↓
searchAddresses(query)
  ↓
Suggestions appear in dropdown
  ↓
User taps suggestion
  ↓
selectedLabel + selectedCoords set
  ↓
User confirms → address + coords saved to store
```

### GPS Location Flow

```
User clicks "Use my current location"
  ↓
GPS coords obtained
  ↓
"Looking up address..." shown
  ↓
┌─────────────────────────────────────────────────┐
│ Reverse geocode succeeds?                        │
│   YES → Show resolved address + map             │
│   NO  → Show "Current location (GPS)" + warning │
└─────────────────────────────────────────────────┘
  ↓
Map shows with draggable pin
  ↓
User can drag pin to refine location
  ↓
User confirms → address + coords saved to store
```

### Interactive Map (Pin-on-Map)

When coordinates exist (from GPS or search), an interactive map is shown with a draggable pin:

```typescript
import MapPinPicker from './components/ui/MapPinPicker'

<MapPinPicker
  lat={coords.lat}
  lng={coords.lng}
  onChange={(newCoords) => {
    // Update coords
    // Trigger reverse geocode for new address
  }}
/>
```

**Features:**
- Uses Leaflet + React-Leaflet with OpenStreetMap tiles
- Draggable marker for precise location adjustment
- Triggers reverse geocode on drag end
- Height: 220px (mobile-friendly)
- Lazy loaded to avoid SSR issues

**Flow:**
```
User sees map with pin at current location
  ↓
User drags pin to new position
  ↓
"Updating address..." shown
  ↓
Reverse geocode runs for new coords
  ↓
Address label updated
  ↓
User confirms → final coords + label saved
```

### Modal Return Flow

When LocationConfirmModal is opened from another modal (e.g., ServicesModal), it returns to the original modal after confirmation:

```typescript
// In ServicesModal
const openLocationModal = () => {
  setPendingReturnModal('services', modalStep) // Save current modal & step
  setActiveModalPreserveStep('locationConfirm')
}

// In LocationConfirmModal (on confirm)
if (pendingReturnModal) {
  setModalStep(pendingReturnModalStep)
  setActiveModalPreserveStep(pendingReturnModal)
  setPendingReturnModal(null)
}
```

---

## Provider Live Tracking

When a booking reaches `en_route` status, the app shows a live tracking map with the provider moving toward the user.

### Overview

**Key Files:**
| File | Purpose |
|------|---------|
| `src/components/ui/TrackingMap.tsx` | Map component showing user + provider markers |
| `src/screens/ChatScreen.tsx` | Tracking simulation logic + TrackingMap rendering |
| `src/types/index.ts` | `providerCoords` and `providerETA` fields on Booking |

### Booking Fields

```typescript
interface Booking {
  // ... existing fields ...
  
  // Provider tracking coordinates (for live tracking)
  providerCoords?: { lat: number; lng: number }
  
  // Live ETA in minutes (updates during tracking)
  providerETA?: number
}
```

### Tracking Flow

```
Booking status: accepted
  ↓
After 3 seconds, status → en_route
  ↓
Provider start position initialized (random offset from user)
providerETA set to 12 minutes
  ↓
TrackingMap appears with user + provider markers
  ↓
Every 3 seconds:
  - Provider moves 20% closer to user
  - providerETA recalculated based on remaining distance
  - Map + ETA display updated
  ↓
When provider within ~30m of user:
  - Status automatically → arrived
  - System message: "Your provider has arrived!"
  - Notification triggered
```

### Tracking Simulation

The tracking is simulated in `ChatScreen.tsx` with a `useEffect` hook:

```typescript
useEffect(() => {
  if (!activeBooking) return
  if (activeBooking.status !== 'en_route') return
  if (!activeBooking.providerCoords) return
  
  const trackingInterval = setInterval(() => {
    // Move provider 20% closer each tick
    const moveRatio = 0.2
    const nextPos = {
      lat: providerPos.lat + (userPos.lat - providerPos.lat) * moveRatio,
      lng: providerPos.lng + (userPos.lng - providerPos.lng) * moveRatio,
    }
    
    // Update ETA based on remaining distance
    const progressRatio = remainingDistance / initialDistance
    const newETA = Math.max(1, Math.round(12 * progressRatio))
    
    // Check if arrived (within ~30m)
    if (remainingDistance < 0.0003) {
      // Trigger arrived status
      updateActiveBookingStatus('arrived')
    }
  }, 3000)
  
  return () => clearInterval(trackingInterval)
}, [activeBooking?.status, activeBooking?.providerCoords])
```

### TrackingMap Component

```typescript
import TrackingMap from './components/ui/TrackingMap'

<TrackingMap
  user={activeBooking.location}
  provider={activeBooking.providerCoords}
/>
```

**Features:**
- Leaflet map with OpenStreetMap tiles
- User marker (blue pin)
- Provider marker (green dot)
- Dashed route line between markers
- Auto-fits bounds to show both markers
- Legend with marker labels
- Height: 220px (mobile-friendly)
- Lazy loaded

### Test Checklist

```
✅ Create booking with confirmed location (GPS or search)
✅ Booking transitions: searching → accepted → en_route
✅ TrackingMap appears with both markers
✅ Provider marker moves toward user every 3 seconds
✅ ETA countdown visible (12 → 8 → 4 → 1 min)
✅ When provider reaches user: status → arrived
✅ System message: "Your provider has arrived!"
✅ Notification fires for 'arrived' status
✅ Cancel/Complete stops tracking immediately
✅ Works on web (no crashes)
```

---

## Payment + Receipt Flow

When a booking is completed, a receipt modal appears with price breakdown and tip options.

### Overview

**Key Files:**
| File | Purpose |
|------|---------|
| `src/components/modals/ReceiptModal.tsx` | Receipt modal with price breakdown + tips |
| `src/store/useAppStore.ts` | Receipt state + setTipForBooking action |
| `src/types/index.ts` | PriceBreakdown type, booking payment fields |

### Booking Fields

```typescript
// Price breakdown for receipts
interface PriceBreakdown {
  baseFee: number
  distanceFee: number
  surgeFee?: number
  total: number
}

interface Booking {
  // ... existing fields ...
  
  // Price breakdown for receipt
  priceBreakdown?: PriceBreakdown
  
  // Payment method display label (e.g., "Visa •••• 4242")
  paymentMethodLabel?: string
  
  // Optional tip amount added by user
  tipAmount?: number
  
  // Whether receipt has been viewed
  receiptViewed?: boolean
}
```

### Receipt Flow

```
User completes booking (Mark Completed button)
  ↓
Booking status → 'completed'
  ↓
ReceiptModal automatically opens
  ↓
User sees:
  - Service summary (type, provider, date/time, location)
  - Price breakdown (base, distance, surge, total)
  - Payment method card
  - Tip options (10%, 15%, 20%, Custom)
  ↓
User selects tip (optional)
  ↓
Grand total updates
  ↓
User clicks "Done"
  ↓
Modal closes, user returns to History
```

### Store State

```typescript
// Receipt Modal (UI-only, not persisted)
receiptBookingId: string | null
openReceipt: (id: string) => void
closeReceipt: () => void
setTipForBooking: (id: string, tipAmount: number) => void
```

### ReceiptModal Features

- **Service summary**: Type, provider name, date/time, location
- **Price breakdown**: Base fee, distance fee, surge (if any), subtotal
- **Payment method**: Shows default "Visa •••• 4242" with Change button
- **Tip section**: 
  - Preset buttons: 10%, 15%, 20%
  - Custom tip input
  - "No tip" option
- **Grand total**: Subtotal + tip
- **Done button**: Closes modal, navigates to History

### Integration Points

1. **ServicesModal**: Generates `priceBreakdown` and `paymentMethodLabel` when creating booking
2. **ChatScreen**: Opens receipt when "Mark Completed" is clicked
3. **BookingDetailModal**: "View Receipt" button for completed bookings

### Test Checklist

```
✅ Create booking → complete it
✅ Receipt modal opens automatically
✅ Price breakdown shows base, distance, surge fees
✅ Payment method displays "Visa •••• 4242"
✅ Tip buttons (10%, 15%, 20%) calculate correct amounts
✅ Custom tip input works
✅ Grand total updates with tip
✅ Done button closes modal → History screen
✅ Booking Detail → "View Receipt" opens receipt
✅ Refresh → completed booking retains breakdown + tip
```

---

## Service Layer Architecture

The app uses a backend-ready service layer to separate business logic from UI components.

### Overview

**Service Files:**
| File | Purpose |
|------|---------|
| `src/services/bookingService.ts` | Booking lifecycle: create, status, tracking |
| `src/services/chatService.ts` | Chat messaging and provider replies |
| `src/services/locationService.ts` | GPS, geocoding, address search |

### bookingService

Handles all booking-related operations:

```typescript
import * as bookingService from './services/bookingService'

// Create a booking
const booking = bookingService.createBookingFromServiceRequest({
  service,
  notes,
  locationLabel,
  locationCoords,
})

// Start booking (sets active, adds to history, creates chat thread)
bookingService.startBooking(booking)

// Update status
bookingService.updateBookingStatus(bookingId, 'accepted')

// Assign provider (from mechanics list)
bookingService.assignProvider(bookingId)

// Initialize tracking when en_route
bookingService.initializeProviderTracking(bookingId)

// Start live tracking simulation (returns stop function)
const stopTracking = bookingService.startProviderTracking(bookingId)

// Complete or cancel
bookingService.completeBooking(bookingId)
bookingService.cancelBooking(bookingId)
```

### chatService

Handles chat messaging:

```typescript
import * as chatService from './services/chatService'

// System messages
chatService.appendSystemMessage(bookingId, 'Provider accepted', 'status_update')

// User messages
chatService.appendUserMessage(bookingId, 'I am here')

// Provider replies
chatService.scheduleProviderIntro(bookingId)  // One-time intro
chatService.scheduleProviderReply(bookingId)  // Auto-reply to user

// Check if provider can reply
if (chatService.canProviderReply(bookingId)) { ... }

// Cleanup
chatService.cleanupReplyTimers(bookingId)
```

### locationService

Handles location operations:

```typescript
import locationService from './services/locationService'

// Get GPS coordinates
const coords = await locationService.getCurrentCoords()

// Reverse geocode to address
const label = await locationService.reverseGeocodeLabel(lat, lng)

// Search addresses
const suggestions = await locationService.searchAddressSuggestions(query)

// Generate maps URL
const url = locationService.getMapUrl(coords)
```

### Key Principles

1. **No React hooks in services** - Services use `useAppStore.getState()` for state access
2. **Immutable state updates** - Services call store actions, never mutate directly
3. **Centralized business logic** - UI components only handle rendering
4. **Backend-ready** - Services can be swapped with API calls

### Test Checklist

```
✅ Create booking → searching → accepted → en_route → arrived → completed
✅ Chat threads persist per booking
✅ Provider replies work after user messages
✅ Tracking simulation moves provider toward user
✅ Receipt opens on completion
✅ Cancel/Complete work from ChatScreen
✅ Location flow (GPS + search + pin) works
```

### Location in Bookings

Location is included in each booking:

```typescript
const booking: Booking = {
  // ...
  location: {
    address: userLocationLabel,       // "123 Main St, Chicago, IL"
    lat: userCoords?.lat ?? fallback,
    lng: userCoords?.lng ?? fallback,
  },
}
```

### Display

- **ServicesModal (Step 3)**: Shows location card with "Tap to change" option
- **History**: Shows location address in booking cards
- **BookingDetailModal**: Shows location with "Open in Maps" link

#### ✅ Test 18: Location Flow

1. **Without confirmed location:**
   - Open Services → select service → fill details → Get Estimate
   - Click "Request Service"
   - **Verify:** LocationConfirmModal opens
2. **GPS location with reverse geocoding:**
   - Click "Use my current location"
   - Grant permission (if asked)
   - **Verify:** Shows "Looking up address..." briefly
   - **Verify:** Resolves to real address (e.g., "123 Main St, Dallas, TX")
   - **Verify:** Interactive map appears with draggable pin
   - **Verify:** Preview card shows the resolved address
   - **Verify:** Search input syncs with resolved address
   - Click "Confirm Location"
   - **Verify:** Returns to ServicesModal Step 3
3. **Pin-on-Map refinement:**
   - Use GPS or select an address suggestion
   - **Verify:** Map shows with pin at location
   - Drag the pin to a new position
   - **Verify:** "Updating address..." shown
   - **Verify:** Address updates to new location
   - **Verify:** Coords update to new position
   - Confirm location
   - **Verify:** Final refined coords + address saved
4. **Address search autocomplete:**
   - Open LocationConfirmModal
   - Type "1600 Penn" in search box
   - **Verify:** "Searching..." shown briefly
   - **Verify:** Suggestions dropdown appears
   - Tap a suggestion
   - **Verify:** selectedLabel + coords set from suggestion
   - **Verify:** Map appears with pin at selected location
   - **Verify:** Search input shows selected address
   - **Verify:** "Open in Maps" link visible
   - Click "Confirm Location"
   - **Verify:** Returns to ServicesModal Step 3
5. **Manual text entry (no suggestion):**
   - Type a custom address (don't pick suggestion)
   - **Verify:** No map shown (no coords)
   - Click "Confirm Location"
   - **Verify:** Text saved as label (coords will be null)
6. **Create booking:**
   - Click "Request Service" again
   - **Verify:** Booking created with confirmed address
7. **View location:**
   - Open History → tap booking
   - **Verify:** BookingDetailModal shows the address + "Open in Maps" link (if coords exist)
8. **Persistence:**
   - Refresh page
   - Start new booking flow
   - **Verify:** Previously confirmed location is preserved
9. **Search failure (offline test):**
   - Disable network
   - Type in search box
   - **Verify:** "Could not search right now" error shown
   - **Verify:** Manual text confirm still works
10. **Reverse geocoding failure (offline test):**
    - Disable network
    - Click "Use my current location"
    - **Verify:** GPS works but address lookup fails
    - **Verify:** Warning shown: "Couldn't fetch address..."
    - **Verify:** Label falls back to "Current location (GPS)"
    - **Verify:** Map still shows, pin still draggable
    - **Verify:** Confirm still works

---

## Future Enhancements

- [x] ~~Persist bookings to localStorage~~ ✅ Implemented
- [x] ~~Location confirmation flow~~ ✅ Implemented
- [x] ~~Provider live tracking~~ ✅ Implemented (simulated)
- [x] ~~Push notifications for status changes~~ ✅ Implemented
- [x] ~~Payment + Receipt flow~~ ✅ Implemented
- [x] ~~Service layer architecture~~ ✅ Refactored for backend-ready
- [ ] Real-time updates via WebSocket
- [ ] Push notifications for status changes
- [ ] Cancel booking functionality
- [ ] Rating/review after completion
- [ ] Payment integration
- [ ] Real driver assignment from backend

---

## Quick Reference

```typescript
// Create booking
const booking: Booking = {
  id: crypto.randomUUID(),
  customerId: 'demo_user',
  service: selectedService,
  status: 'searching',
  location: { address: '...', lat: 0, lng: 0 },
  estimatedPrice: 50,
  createdAt: new Date(),
}
setActiveBooking(booking)
addToBookingHistory(booking)

// Update status
updateActiveBookingStatus('accepted', { estimatedArrival: 10 })

// Navigate to chat
setCurrentScreen('chat')

// Clear active booking
clearActiveBooking()
```

---

*Last updated: January 2026*
