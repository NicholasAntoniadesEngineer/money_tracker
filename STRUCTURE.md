# Money Tracker - Codebase Structure

## Folder Organization Principle

**Rule**: Resources are placed based on **usage scope**
- **Shared** (`/shared/`) → Used by 2+ features
- **Feature-specific** → Only in that feature's folder

---

## 📁 Root Structure

```
/
├── index.html                  → Redirects to landing page
├── favicon.ico                 → Site favicon
│
├── /auth                       → Authentication feature
├── /database                   → Database layer & models
├── /landing                    → Landing page (main entry)
├── /messaging                  → Messaging feature
├── /monthlyBudget              → Monthly budget feature
├── /notifications              → Notifications feature
├── /payments                   → Payments/subscription feature
├── /pots                       → Pots & investments feature
├── /settings                   → Settings feature
├── /shared                     → Shared resources (used by 2+ features)
└── /referenceData              → Example/reference data
```

---

## 🌍 /shared Folder - Truly Shared Resources

**Purpose**: Resources used by **multiple features** (2+)

```
/shared/
├── /assets/                    → Shared static assets
│   └── siteBackgroundImage.jpg
│
├── /config/                    → Global app configuration
│   ├── constants.js            → App-wide constants
│   └── moduleRegistry.js       → Module registration
│
├── /header/                    → Header component (used on ALL pages)
│   ├── header.js               → Header logic & rendering
│   └── header.css              → Header/navigation styles
│
├── /services/                  → Services used by multiple features
│   ├── authService.js          → ✓ Used by ALL features
│   ├── calculationService.js   → ✓ Used by monthlyBudget + pots
│   ├── exportService.js        → ✓ Used by multiple features
│   ├── fileService.js          → ✓ Used by multiple features
│   ├── formHandler.js          → ✓ Used by multiple features
│   └── tableRenderer.js        → ✓ Used by monthlyBudget + others
│
├── /styles/                    → Global styles
│   ├── main.css                → Main stylesheet imports
│   ├── variables.css           → CSS variables (colors, spacing)
│   ├── reset.css               → CSS reset
│   ├── typography.css          → Typography styles
│   ├── layout.css              → Layout utilities
│   ├── utilities.css           → Utility classes
│   ├── responsive.css          → Responsive breakpoints
│   ├── print.css               → Print styles
│   └── /components/            → Shared component styles
│       ├── buttons.css
│       ├── cards.css
│       ├── forms.css
│       └── tables.css
│
├── /utils/                     → Utilities used by multiple features
│   ├── authGuard.js            → ✓ Used by ALL protected pages
│   ├── subscriptionGuard.js    → ✓ Used by ALL premium features
│   ├── errorHandler.js         → ✓ Used by ALL features
│   ├── validators.js           → ✓ Form validation everywhere
│   ├── formatters.js           → ✓ Data formatting everywhere
│   ├── logger.js               → ✓ Logging everywhere
│   ├── networkUtils.js         → ✓ Network helpers everywhere
│   ├── offlineHandler.js       → ✓ Offline handling everywhere
│   ├── fontSizeLoader.js       → ✓ Font size across app
│   ├── csvHandler.js           → ✓ CSV export (settings + monthlyBudget)
│   └── referenceImporter.js    → ✓ Reference import (settings + monthlyBudget)
│
└── /vendor/                    → Third-party libraries
    └── font-awesome/           → Icon library
```

---

## 🏠 /landing - Landing Page

**Purpose**: Main entry point & landing page **only**

```
/landing/
├── index.html                  → Main landing page
├── /controllers/
│   └── landingController.js    → Landing page logic
├── /styles/
│   ├── landing.css             → Landing-specific styles
│   └── overview.css            → Overview section styles
└── /utils/
    ├── initialData.js          → Landing initial data
    └── embeddedInitialData.js  → Embedded data for landing
```

---

## 📊 Feature Folders - Standard Structure

Each feature follows this pattern:

```
/featureName/
├── /controllers/               → Feature-specific controllers
│   └── featureController.js
├── /services/                  → Feature-specific services
│   └── featureService.js       → (only if used ONLY by this feature)
├── /views/                     → HTML pages
│   └── feature.html
└── /styles/                    → Feature-specific CSS
    └── feature.css
```

### Examples:

**monthlyBudget** - Only this feature
```
/monthlyBudget/
├── /controllers/
│   └── monthlyBudgetController.js
├── /styles/
│   └── monthlyBudget.css
└── /views/
    └── monthlyBudget.html
```

**messaging** - Has its own services
```
/messaging/
├── /controllers/
│   └── messengerController.js
├── /crypto/                    → E2E encryption (messaging-specific)
│   ├── cryptoService.js
│   ├── keyManager.js
│   ├── keyStorageService.js
│   └── naclLoader.js
├── /services/
│   └── messagingService.js     → Used ONLY by messenger
└── /views/
    └── messenger.html
```

---

## 🗄️ /database - Data Layer

```
/database/
├── /config/                    → Database configuration
├── /migrations/                → SQL migration files (01-18)
├── /models/                    → Data models
│   ├── dataManager.js
│   ├── monthFactory.js
│   └── storageService.js
├── /services/                  → Database services
│   ├── databaseService.js
│   ├── dataSharingService.js
│   ├── fieldLockingService.js
│   ├── notificationService.js
│   └── ...
├── /supabaseEdgeFunctions/     → Backend edge functions (.ts)
│   ├── findUserByEmail.ts
│   ├── getUserEmailById.ts
│   ├── createCheckoutSession.ts
│   └── ...
├── /utils/
├── databaseModule.js
└── initDatabase.js
```

---

## Decision Guide: Where Should This Go?

### ✅ Put in `/shared` if:
- Used by 2+ features
- Header component (logic + styles in `/shared/header/`)
- Global configuration
- Common utilities (auth, validation, formatting)
- Shared services (calculation, export, file handling)
- Base styles & CSS variables

### ✅ Put in feature folder if:
- Used ONLY by that feature
- Feature-specific controller
- Feature-specific view/HTML
- Feature-specific CSS
- Feature-specific service

### Examples:

| File | Location | Why |
|------|----------|-----|
| `header.js` | `/shared/header/` | Used on ALL pages |
| `header.css` | `/shared/header/` | Header styles (all pages) |
| `authService.js` | `/shared/services/` | Used by ALL features |
| `monthlyBudgetController.js` | `/monthlyBudget/controllers/` | Only used by monthlyBudget |
| `messagingService.js` | `/messaging/services/` | Only used by messenger |
| `calculationService.js` | `/shared/services/` | Used by monthlyBudget AND pots |
| `landing.css` | `/landing/styles/` | Only used by landing page |
| `monthlyBudget.css` | `/monthlyBudget/styles/` | Only used by monthlyBudget |

---

## Benefits of This Structure

✅ **Clear separation** - Easy to find files  
✅ **No duplication** - Shared code in one place  
✅ **Easy maintenance** - Change shared code once  
✅ **Scalable** - New features follow same pattern  
✅ **Self-documenting** - Location indicates usage  
