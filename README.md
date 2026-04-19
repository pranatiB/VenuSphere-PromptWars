# VenueFlow — AI-Powered Smart Stadium Assistant

> **Championship Final 2026 · Olympic Stadium · 60,000 capacity**

VenueFlow is a premium, real-time Progressive Web App (PWA) that transforms the fan experience at large-scale sporting venues. Built with a **modern glassmorphism design system** and powered by **Google Cloud + Vertex AI Gemini**, it provides an effortless, one-thumb experience for navigating crowds and coordinating movement intelligently during live events.

---

## Live Demo Walkthrough

| Step | Action | What you see |
|------|--------|-------------|
| 1 | Open the app | **Premium Live Hero**: dynamic ambient background, glowing live dot, and event-focused status |
| 2 | Tap **Map** | Zone-based crowd heatmap — glassmorphic overlays with 15/30-min predictions |
| 3 | Tap **AI** → ask *"Where should I eat with no line?"* | Gemini ranks stalls by queue + dietary preferences |
| 4 | Tap **Queues** | Real-time wait bars for all 8 stalls, 6 restrooms — filter by type |
| 5 | Tap **Events** | Timeline with current phase highlighted, featuring smooth glass transitions |
| 6 | Tap the **AI FAB** | Centrally located Floating Action Button optimized for one-thumb walking usage |

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Frontend (Vanilla JS + ES Modules via CDN)         │
│  ├── Firebase SDK  ── Auth + Firestore onSnapshot   │
│  ├── Google Maps JS API  ── Zone polygons + Dirs    │
│  └── /api/* fetch  ── with Firebase Auth token      │
└─────────────┬───────────────────────────────────────┘
              │ HTTPS + Auth header
┌─────────────▼───────────────────────────────────────┐
│  Cloud Functions (Python 3.11, 2nd gen)             │
│  venueflow_api — single HTTP dispatcher             │
│  ├── crowd_service  ── density + predictions        │
│  ├── queue_service  ── wait times + alerts          │
│  ├── assistant_service  ── Gemini 1.5 Flash         │
│  ├── event_service  ── schedule + Firestore pub     │
│  ├── notification_service  ── threshold alerts      │
│  └── analytics_service  ── Cloud Logging            │
└─────────────┬───────────────────────────────────────┘
              │
┌─────────────▼───────────────────────────────────────┐
│  Google Cloud Services                              │
│  ├── Firestore  ── Real-time data + user prefs     │
│  ├── Firebase Auth  ── Anonymous + Google SSO       │
│  ├── Vertex AI Gemini 1.5 Flash  ── Chat + NLP     │
│  ├── Cloud Scheduler  ── Crowd simulation triggers  │
│  └── Cloud Logging  ── Audit + observability        │
└─────────────────────────────────────────────────────┘
```

---

## Google Cloud Services Map

| Service | Purpose | Why |
|---------|---------|-----|
| **Vertex AI (Gemini 1.5 Flash)** | Smart assistant, predictions | Core intelligence — contextual reasoning |
| **Cloud Functions (Python 3.11)** | Serverless backend API | Auto-scaling, no server management |
| **Firestore** | Real-time database | `onSnapshot` for live crowd/queue updates |
| **Firebase Auth** | Anonymous + Google SSO | Zero-friction onboarding |
| **Firebase Hosting** | PWA hosting + CDN | Fast global delivery, HTTPS by default |
| **Cloud Pub/Sub** | Event broadcasting | Simulated via Firestore for demo |
| **Google Maps JS API** | Venue map + polygons | Zone visualisation, 12 zone overlays |
| **Directions API** | Walking navigation | Crowd-aware zone-to-zone routes |
| **Cloud Scheduler** | Crowd simulation triggers | Periodic sensor data updates |
| **Cloud Logging** | Observability + audit | Structured JSON event logging |

---

## Project Structure

```
venueflow/
├── backend/
│   ├── main.py                    # Cloud Function HTTP dispatcher
│   ├── models/
│   │   ├── venue.py               # Zone, Stall, Restroom dataclasses
│   │   ├── user.py                # UserPreferences, ChatSession
│   │   └── event.py               # EventPhase, SmartAlert, Announcement
│   ├── services/
│   │   ├── crowd_service.py       # Density reads, trends, predictions
│   │   ├── queue_service.py       # Wait times, best-time recommendations
│   │   ├── assistant_service.py   # Gemini 1.5 Flash chat + context
│   │   ├── event_service.py       # Schedule, alerts, announcements
│   │   ├── notification_service.py# Queue threshold alerts
│   │   └── analytics_service.py   # Cloud Logging structured events
│   ├── utils/
│   │   ├── security.py            # Auth validation, rate limiting, XSS
│   │   └── cache.py               # In-memory TTL cache for Firestore
│   ├── tests/
│   │   ├── conftest.py            # Shared fixtures (mock Firestore, auth)
│   │   ├── test_crowd_service.py
│   │   ├── test_queue_service.py
│   │   ├── test_assistant_service.py
│   │   ├── test_event_service.py
│   │   └── test_security.py
│   └── requirements.txt
├── frontend/
│   ├── index.html                 # PWA shell (semantic HTML5, ARIA)
│   ├── manifest.json              # PWA manifest (SVG icons)
│   ├── sw.js                      # Service worker (cache-first + offline)
│   ├── css/styles.css             # Complete design system (~800 lines)
│   └── js/
│       ├── app.js                 # Bootstrap + hash router
│       ├── components/
│       │   ├── dashboard.js       # Capacity ring + zone overview
│       │   ├── crowd-map.js       # Google Maps zone polygons
│       │   ├── assistant.js       # Gemini chat UI
│       │   ├── queue-tracker.js   # Wait time grid + alerts
│       │   ├── schedule.js        # Timeline + announcements
│       │   ├── navigation.js      # Crowd-aware directions
│       │   └── settings.js        # Preferences + auth management
│       ├── services/
│       │   ├── firebase-client.js # Auth + Firestore subscriptions
│       │   ├── api-client.js      # Backend API typed helpers
│       │   └── maps-client.js     # Lazy Maps loader + polygons
│       ├── utils/
│       │   ├── a11y.js            # aria-live, focus trap, toasts
│       │   └── i18n.js            # Locale loader + t() helper
│       └── assets/locales/        # en, es, fr, hi, zh translations
├── seed/
│   ├── seed_venue.py              # Firestore seeding script
│   └── demo_data.json             # Olympic Stadium data (< 50 KB)
├── firebase.json                  # Hosting + Functions config
├── firestore.rules                # Security rules (OWASP compliant)
├── firestore.indexes.json         # Composite indexes
├── .lighthouserc.json             # Accessibility CI config
└── .gcloudignore
```

---

## Setup & Configuration

### Prerequisites
- Node.js 18+ (for Firebase CLI)
- Python 3.11+
- A Google Cloud project with billing enabled
- Firebase project linked to the GCP project

### 1 — Clone & Configure

```bash
git clone https://github.com/your-org/VenuSphere-PromptWars.git
cd VenuSphere-PromptWars
```

**Replace placeholder config values:**

In `frontend/js/services/firebase-client.js`:
```js
const FIREBASE_CONFIG = {
  apiKey: "YOUR_FIREBASE_API_KEY",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
};
```

In `frontend/js/services/maps-client.js`:
```js
const MAPS_API_KEY = 'YOUR_GOOGLE_MAPS_API_KEY';
```

### 2 — Enable Google Cloud APIs

```bash
gcloud services enable \
  firestore.googleapis.com \
  aiplatform.googleapis.com \
  maps-backend.googleapis.com \
  cloudfunctions.googleapis.com \
  cloudscheduler.googleapis.com
```

### 3 — Seed Demo Data

```bash
cd seed
pip install firebase-admin
export FIREBASE_PROJECT_ID=your-project-id
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
python seed_venue.py
```

### 4 — Run Backend Tests

```bash
cd backend
pip install -r requirements.txt
pytest tests/ -v --cov=services --cov=utils --cov-report=term-missing
```

**Expected coverage**: ≥ 80% across `services/` and `utils/`.

### 5 — Deploy Backend (Cloud Functions)

```bash
gcloud functions deploy venueflow_api \
  --gen2 \
  --runtime python311 \
  --region us-central1 \
  --source backend \
  --entry-point venueflow_api \
  --trigger-http \
  --allow-unauthenticated=false \
  --set-env-vars CORS_ORIGIN=https://your-project.web.app
```

### 6 — Deploy Frontend (Firebase Hosting)

```bash
npm install -g firebase-tools
firebase login
firebase use your-project-id
firebase deploy --only hosting,firestore:rules,firestore:indexes
```

### 7 — Local Development

Serve the frontend with any static server:

```bash
python -m http.server 8080 --directory frontend
# Open http://localhost:8080
```

For Cloud Function local testing:
```bash
cd backend
functions-framework --target venueflow_api --debug
```

---

## API Reference

All endpoints require `Authorization: Bearer <firebase_id_token>` except `/api/health`.
Rate limit: **30 requests / 60 seconds** per user.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Liveness check (no auth) |
| `GET` | `/api/crowd` | All zone densities + current phase |
| `GET` | `/api/crowd/{zone_id}` | Single zone + 15/30-min predictions |
| `GET` | `/api/queue` | All stall/restroom wait times |
| `GET` | `/api/queue/{stall_id}` | Single stall + best-time recommendation |
| `POST` | `/api/queue/{stall_id}/subscribe` | Subscribe for wait drop alert |
| `POST` | `/api/chat` | Gemini assistant chat message |
| `GET` | `/api/schedule` | Event schedule + alerts |
| `GET` | `/api/alerts` | Smart alerts for current phase |
| `POST` | `/api/checkin` | Anonymous zone check-in |
| `GET` | `/api/preferences` | Load user preferences |
| `PUT` | `/api/preferences` | Save user preferences |
| `POST` | `/api/navigate` | Crowd-aware zone navigation |
| `GET` | `/api/announcements` | Recent venue announcements |

---

## Security

- **Firebase Auth token validation** on every request (`utils/security.py`)
- **Rate limiting**: sliding 60-second window, max 30 req/user
- **Input sanitization**: HTML escaping, max-length enforcement (XSS prevention)
- **Firestore rules**: users read-only on venue data; write only to own `/users/{uid}`
- **CORS**: restricted to Firebase Hosting domain only
- **CSP headers**: configured in `firebase.json` headers section
- **No secrets in code**: all keys via environment variables / window config object
- **Anonymous UID hashing**: SHA-256 for all analytics logging

---

## Performance

- **Lazy component loading**: each view lazy-imports only on navigation
- **Service worker**: cache-first for static, network-first for API; offline fallback
- **Firestore debouncing**: 500ms on all `onSnapshot` listeners
- **Maps lazy-load**: Google Maps JS only loaded when Map view is opened
- **Premium Mesh Background**: Animated SVG + CSS orbs for a dynamic, "alive" feeling without heavy video/assets.
- **Image-free design**: 100% SVG icons + CSS shapes — zero image files in repo for instant loading.

---

## Accessibility (WCAG 2.1 AA)

- Semantic HTML5 throughout — headings, landmarks, lists, articles
- `aria-live` regions for real-time crowd/queue/announcement updates
- Full keyboard navigation — skip link, focus trap on drawers
- `aria-label` and `aria-current` on all interactive elements
- Color contrast ratio ≥ 4.5:1 for all text (verified in design system)
- High-contrast theme toggle (persisted to localStorage)
- `prefers-reduced-motion` — disables all animations system-wide
- Minimum 44×44px tap targets on all buttons
- Multi-language: English, Español, Français, हिन्दी, 中文

---

## Testing

```bash
# All tests (mock all Google APIs — no external dependencies)
cd backend
pytest tests/ -v --cov=services --cov=utils --cov-report=term-missing

# Individual test files
pytest tests/test_security.py -v          # Security & OWASP tests
pytest tests/test_crowd_service.py -v     # Crowd density logic
pytest tests/test_queue_service.py -v     # Queue wait time logic
pytest tests/test_assistant_service.py -v # Gemini intent + fallback
pytest tests/test_event_service.py -v     # Phase + alert logic

# Lighthouse accessibility audit (requires Node.js + lhci)
npm install -g @lhci/cli
lhci autorun
```

---

## Venue Data

- **Stadium**: Olympic Stadium (Wembley coordinates: 51.5560°N, 0.2795°W)
- **Capacity**: 60,000
- **Zones**: 12 (4 gates, 4 stands, 2 food courts, 1 merchandise, 1 concourse)
- **Stalls**: 8 (food, beverage, merchandise)
- **Restrooms**: 6 blocks
- **Event**: Championship Final 2026 — 5 phases with realistic crowd simulations

---

## Repository Size

| Area | Files | Est. Size |
|------|-------|-----------|
| Backend Python | 15 | ~125 KB |
| Frontend JS | 15 | ~95 KB |
| CSS | 1 | ~18 KB |
| HTML | 1 | ~8 KB |
| Locale JSONs | 5 | ~12 KB |
| Seed data | 2 | ~35 KB |
| Config files | 5 | ~10 KB |
| Tests | 6 | ~55 KB |
| **Total** | **~50** | **~358 KB** |

Well within the **10 MB** constraint.

---

## License

MIT © 2026 VenuSphere Project