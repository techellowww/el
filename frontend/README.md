# ClientHub — Full-Stack Next.js Application

Production-grade, full-stack Next.js web application for client management, project deliverables, working-hour tracking, proposals, and automated reporting.

---

## 1. Project Folder Structure

The project follows a modular, feature-driven production-ready Next.js architecture:

```text
frontend/
├── prisma/
│   ├── schema.prisma           # Prisma schema & database models
│   ├── migrations/             # Database schema migrations
│   └── seed.ts                 # Database seeder (Admin, Employee, Projects)
│
├── public/
│   ├── images/                 # Static brand images & illustrations
│   └── fonts/                  # Custom typography files
│
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── (auth)/             # Route group: Authentication
│   │   │   └── login/          # /login page
│   │   │
│   │   ├── (dashboard)/        # Route group: Authenticated AppShell
│   │   │   ├── layout.tsx      # Dashboard shell layout wrapper
│   │   │   ├── dashboard/      # /dashboard
│   │   │   ├── calendar/       # /calendar
│   │   │   ├── clients/        # /clients
│   │   │   ├── employees/      # /employees
│   │   │   ├── invoices/       # /invoices
│   │   │   ├── mail/           # /mail
│   │   │   ├── office-timings/ # /office-timings
│   │   │   ├── projects/       # /projects
│   │   │   ├── proposals/      # /proposals
│   │   │   ├── screenshot/     # /screenshot
│   │   │   ├── settings/       # /settings
│   │   │   └── time-sheet/     # /time-sheet
│   │   │
│   │   ├── api/                # API Route Handlers
│   │   │   ├── auth/           # Login, logout, session me, profile
│   │   │   ├── clients/        # Client CRUD & assignment
│   │   │   ├── employees/      # Employee directory & management
│   │   │   ├── events/         # Calendar events & ICS
│   │   │   ├── invoices/       # Invoicing & line items
│   │   │   ├── mail/           # Email report engine & SMTP
│   │   │   ├── notifications/  # System notifications & alerts
│   │   │   ├── office-timings/ # Office schedule & cutoff
│   │   │   ├── portal/         # Public client portal
│   │   │   ├── projects/       # Projects, sub-projects, updates
│   │   │   ├── proposals/      # Proposals, AI drafts, signatures
│   │   │   ├── screenshots/    # Employee screenshot monitoring
│   │   │   ├── settings/       # Agency branding & settings
│   │   │   ├── time/           # Stopwatch timer & logs
│   │   │   ├── chat/           # Real-time team messaging
│   │   │   └── background/     # Automated background jobs
│   │   │
│   │   ├── invoice/[token]/    # Public client invoice view
│   │   ├── portal/[token]/     # Public client deliverable portal
│   │   ├── proposal/[token]/   # Public client proposal acceptance
│   │   ├── layout.tsx          # Root application layout
│   │   ├── page.tsx            # Root redirector (/dashboard or /login)
│   │   ├── loading.tsx         # Global loading spinner
│   │   ├── error.tsx           # Global error boundary
│   │   ├── not-found.tsx       # Global 404 page
│   │   └── globals.css         # Tailwind CSS v4 design tokens
│   │
│   ├── components/             # Reusable UI & Layout Components
│   │   ├── ui/                 # Atomic UI (MiniModal, PrintButton, TimePicker)
│   │   ├── forms/              # Reusable Form Modals (EditProfileModal)
│   │   └── layout/             # Shell Layouts (AppShell, ChatDrawer)
│   │
│   ├── features/               # Domain-Driven Feature Modules
│   │   ├── auth/               # Auth types, validation schemas, actions
│   │   ├── users/              # Users & employee features (components, actions, queries)
│   │   ├── projects/           # Projects domain logic
│   │   ├── clients/            # Clients domain logic
│   │   ├── timer/              # Time-tracking domain logic
│   │   ├── invoices/           # Invoicing domain logic
│   │   └── proposals/          # Proposals domain logic
│   │
│   ├── lib/                    # Core Infrastructure & Client Utilities
│   │   ├── db.ts               # Global Prisma client singleton
│   │   ├── auth.ts             # Centralized authentication helpers
│   │   ├── utils.ts            # Formatting, class merging (cn), helpers
│   │   ├── env.ts              # Centralized environment variable validation
│   │   ├── apiCache.ts         # Client memory cache
│   │   ├── screenshotCapture.ts# Screen stream & canvas capture
│   │   └── store.ts            # Zustand client state store
│   │
│   ├── hooks/                  # Custom Client React Hooks
│   │   ├── useAuth.ts          # Authentication hook
│   │   ├── useTimer.ts         # Timer & stopwatch hook
│   │   └── useUI.ts            # Navigation & modal UI hook
│   │
│   ├── services/               # Server-Side Business Services
│   │   ├── calendarService.ts  # Calendar & event queries
│   │   ├── chatService.ts      # Team chat messaging operations
│   │   ├── emailService.ts     # SMTP transport & email notifications
│   │   ├── invoiceService.ts   # Invoice numbering & status
│   │   ├── notificationService.ts # Alerts & notification queues
│   │   ├── proposalService.ts  # Proposal locking & signatures
│   │   ├── reportEngine.ts     # Working-hour aggregations & export
│   │   ├── screenshotBackupService.ts # Backup persistence
│   │   ├── screenshotGenerator.ts # Image processing & compression
│   │   ├── subProjectService.ts # Sub-project hierarchy
│   │   ├── timerEngine.ts      # Office schedules & auto-cutoff
│   │   ├── audit.ts            # Compliance & audit logging
│   │   └── backgroundJobs.ts   # Automated background jobs
│   │
│   ├── types/                  # Global TypeScript Interfaces
│   ├── constants/              # System Constants & Defaults
│   └── middleware.ts           # Route Guard & Session Middleware
│
├── .env                        # Local environment configuration
├── .env.example                # Environment template
├── .gitignore                  # Git ignore rules
├── next.config.ts              # Next.js configuration
├── tsconfig.json               # TypeScript compiler config
└── package.json                # Project dependencies and scripts
```

---

## 2. Getting Started

### Install Dependencies
```bash
npm install
```

### Run Database Migrations & Seed
```bash
npm run build
```

### Start Local Development Server
```bash
npm run dev
# Running on http://localhost:3000
```

