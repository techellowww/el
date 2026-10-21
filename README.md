# EL App — Employee Project Time Tracking & Management System

> Production-grade, secure, and responsive web application for employee project time tracking, working-hour management, project monitoring, automated reporting, and administrative control.

---

## 1. Project Structure

The project is decoupled into two clean, self-contained directories:

```
d:\el\
├── backend/                  # Node.js + Express + Prisma API Server
│   ├── prisma/
│   │   ├── schema.prisma     # PostgreSQL schema (el_system namespace)
│   │   └── seed.ts           # Database seeder (Admin + Employees + Projects)
│   ├── src/
│   │   ├── lib/              # Core engines (TimerEngine, ReportEngine, Email, Cron, Auth, Audit)
│   │   ├── routes/           # REST API routes (Auth, Timer, Projects, TimeEntries, Reports, etc.)
│   │   └── server.ts         # Express server with CORS & cookie parsing (Port 5000)
│   ├── tests/                # Automated integration tests (Timer & business logic suite)
│   ├── .env                  # Backend database & server environment configuration
│   └── package.json          # Backend dependencies and scripts
│
├── frontend/                 # Next.js 16 + React 19 Client Web Application
│   ├── public/               # Static assets & icons
│   ├── src/
│   │   ├── app/              # App Router pages (Dashboard, Projects, Time-logs, Reports, etc.)
│   │   ├── components/       # UI components (AppShell layout, Navigation)
│   │   └── lib/              # Zustand state store & API client (store.ts)
│   ├── next.config.ts        # Next.js config with API proxy rewrites to Backend (Port 5000)
│   ├── .env                  # Frontend port & backend API target URL (Port 3000)
│   └── package.json          # Frontend dependencies and scripts
│
├── .gitignore
├── AGENTS.md
└── README.md                 # System documentation & setup guide
```

---

## 2. Technology Stack Architecture

| Layer | Directory | Technology | Port / Purpose |
| :--- | :--- | :--- | :--- |
| **Frontend Web App** | `frontend/` | **Next.js 16 (React 19, TypeScript)** | Port 3000. App Router, dynamic navigation, Tailwind CSS v4, Lucide icons, Zustand state, Recharts analytics. |
| **API Server** | `backend/` | **Express 4 + Node.js + TypeScript** | Port 5000. REST API endpoints, JWT authentication in HTTP-only cookies, CORS, cookie-parser. |
| **Data Layer & ORM** | `backend/` | **Prisma ORM 6.4.1** | PostgreSQL relational modeling with schema namespace `el_system`. |
| **Database** | — | **PostgreSQL 16** | Relational ACID transactions for financial and working-hour integrity. |
| **Background Jobs** | `backend/` | **node-cron** | Automatic office cut-offs and email report delivery scheduling. |
| **Report Exports** | `backend/` | **SheetJS (xlsx) + CSV engine** | Server-side Excel workbook generation and RFC-4180 CSV exports. |
| **Email Service** | `backend/` | **Nodemailer** | SMTP email delivery with simulated log fallback. |

---

## 3. Quick Start & Running Locally

Both projects are independent. Start each in its respective folder:

**Terminal 1 — Backend API Server:**
```bash
cd backend
npm run dev
# Server running at http://localhost:5000
# Health check: http://localhost:5000/health
```

**Terminal 2 — Frontend Next.js Client:**
```bash
cd frontend
npm run dev
# Web application running at http://localhost:3000
```

---

## 4. Building & Running Tests

**Backend Tests & Database:**
```bash
cd backend

# Run the 14-point business logic & timer test suite
npm test

# Generate Prisma client
npm run prisma:generate

# Seed the database
npm run seed
```

**Frontend Production Build:**
```bash
cd frontend
npm run build
```

---

## 5. Seed Credentials

The database contains pre-configured accounts:

| Role | Email | Password | Scope & Permissions |
| :--- | :--- | :--- | :--- |
| **Admin** | `ellowwwstudio@gmail.com` | `Password@123` | Full system access, all employees, settings, approvals, direct edits. |
| **Employee** | `john.doe@elapp.local` | `Password@123` | Project timer, own logs, time correction requests, weekly summaries. |
| **Employee** | `sarah.connor@elapp.local` | `Password@123` | Assigned to internal design and product tools. |
| **Employee** | `alex.miller@elapp.local` | `Password@123` | Engineering projects. |

---

## 6. API Proxy Architecture
The frontend proxies all `/api/*` requests directly to `http://localhost:5000/api/*` via Next.js rewrites in `frontend/next.config.ts`. This ensures:
- Cookies (`el_session_token`) flow seamlessly between browser and backend.
- Relative `fetch('/api/...')` paths in the UI remain simple and robust.
- Zero CORS friction in production deployments or local development.
