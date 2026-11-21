# Team-1 MVP Build Plan

Source: `SRS.docx` — *Flexible Work & Local Services Marketplace, Jimma pilot* (Nov 2026).

## 1. Constraints

| | |
|---|---|
| Team | 1 developer |
| Time box | ~3 hours for Phase 1 MVP |
| Stack | TypeScript everywhere: React + Vite (web), Node + Express 5 (API), PostgreSQL 18 (`pg` + SQL migrations), Zod (shared validation) |
| Shape | Modular monolith, npm workspaces monorepo (SRS §23) |
| Auth | Phone + OTP via a **mock provider** (code logged to API console), httpOnly session cookie |

The target is the SRS §35 **Definition of Done** journey, end to end, without manual DB edits. Everything not needed for that journey is stubbed behind an interface or deferred.

## 2. Scope

### In (must work at the 3h mark)
- Mock-OTP sign-in, username + language on first login, logout (SRS §6)
- One account, Worker/Employer mode toggle (§5)
- Worker profile (bio, skills, availability, area, travel range) and employer profile (type, business name, area) (§6)
- Job posting: create draft, publish, edit, cancel, with tier from category (§7, §8)
- Browse + filter jobs: category, tier, area, pay type/range, date, "eligible only" (§9)
- Apply / withdraw; employer views applicants without contact data; select / reject (§10)
- Pairing: worker accepts selection → pairing `confirmed` → contact details unlocked (§11)
- Completion: both sides confirm → `completed` (§11)
- Reviews: one per reviewer per completed pairing, 1–5 on overall/reliability/communication/quality (§15)
- Rebook: employer creates a repeat request from a completed pairing; worker accepts → new pairing (§16)
- Reports against a user/job/pairing; admin queue (§19, §21)
- Verification: user submits request; admin approves/rejects; admin grants high-trust approval (§7, §19)
- In-app notifications for every status change (§20)
- Role-based access: `user` / `support` / `admin`, enforced in the API (§5, §21)
- Audit log for admin actions (§19)
- Seed data + automated API test of the DoD journey (§35)
- English, Afaan Oromoo and Amharic UI (typed dictionaries in `apps/web/src/lib/locales`; API errors carry stable codes the client translates)
- Block user: either side can block; blocked pairs are hidden from job browse/applicant lists and cannot apply, select, or rebook each other; pending applications between them are withdrawn/rejected; unblock from the public profile or the blocked list on `/profile`
- Saved jobs (favorites): bookmark on job cards and job detail; list under worker dashboard (`GET /me/favorites`)

### Stubbed (interface exists, no real provider)
- **OTP/SMS**: `OtpProvider` interface, `ConsoleOtpProvider` implementation
- **Payments**: pairing has `payment_status` (`not_required` for MVP). No money moves; SRS §12 forbids assuming escrow before legal review
- **File uploads**: verification takes a text note/reference only; no identity documents stored yet

### Deferred (Phase 2+)
Real SMS, payment provider, document upload storage, interactive maps, business/bulk jobs, all AI features, push/SMS notifications.

### Added after MVP journey
- **Block user**, **job favorites**, **lazy job expiry**, **pairing disputes** (open → staff resume or cancel; no payment escrow).
- **Support tickets**: users open threads (`/tickets`); staff reply and resolve from admin; in-app notifications on reply/status.
- **Light / dark / system theme** (persisted; zinc palette remaps under `.dark`).
- **Distance browse**: `near` + `radiusKm` using Jimma neighborhood centers (no map provider).

## 3. Repo layout

```
apps/
  api/                Express API (port 4000)
    migrations/       numbered .sql files, applied by src/db/migrate.ts
    src/
      db/             pool, migrate, seed
      modules/        auth, profiles, jobs, applications, pairings, reviews,
                      rebookings, reports, verification, notifications, admin
      lib/            errors, auth middleware, otp provider, audit
  web/                React + Vite (port 5173, proxies /api -> 4000)
    src/
      pages/          one file per route
      components/
      lib/            api client, auth context, i18n strings
packages/
  shared/             Zod schemas + enums shared by api and web
docs/PLAN.md
```

## 4. Data model (migration `001_init.sql`)

| Table | Key columns |
|---|---|
| `users` | id, phone (unique, private), username (unique, public), language `en/am/om`, role `user/support/admin`, active_mode `worker/employer`, identity_verified, high_trust_approved, status |
| `otp_codes` | phone, code_hash, expires_at, attempts, consumed_at |
| `sessions` | token_hash, user_id, expires_at |
| `worker_profiles` | user_id PK, bio, experience_level, availability, area, landmark, travel_km |
| `employer_profiles` | user_id PK, employer_type, business_name, area |
| `job_categories` | id, slug, name, tier `ordinary/skilled/vip` |
| `skills`, `user_skills` | skill catalog; user ↔ skill |
| `jobs` | employer_id, category_id, tier (copied from category), title, description, area, landmark, lat/lng (nullable), starts_at, ends_at, pay_type, pay_min, pay_max, workers_needed, application_deadline, status |
| `applications` | job_id, worker_id, message, status; unique (job_id, worker_id) |
| `pairings` | job_id, employer_id, worker_id, application_id, status, payment_status, employer_completed_at, worker_completed_at |
| `reviews` | pairing_id, reviewer_id, reviewee_id, overall, reliability, communication, quality, body, moderation_status; unique (pairing_id, reviewer_id) |
| `rebookings` | original_pairing_id, new_job_id, status |
| `reports` | reporter_id, target_type, target_id, reason, status, resolved_by |
| `verification_records` | user_id, kind `identity/skill/high_trust`, note, status, reviewer_id, reviewed_at |
| `notifications` | user_id, type, payload jsonb, read_at |
| `audit_logs` | actor_id, action, target_type, target_id, details jsonb |

## 5. Status machines

**Job**: `draft → published → filled | cancelled | expired`. A job becomes `filled` when it has `workers_needed` confirmed pairings. Published jobs with no active pairing are marked `expired` (lazily on browse/detail/apply) when `application_deadline` or, if none, `ends_at` is in the past; pending applications are rejected and applicants notified.

**Application**: `pending → selected | rejected | withdrawn`. `selected` creates a pairing in `pending_confirmation`.

**Pairing**: `pending_confirmation → confirmed → in_progress → completed`; `pending_confirmation → declined`; any active state → `cancelled` or `disputed`. Either party can open a dispute (reason required); staff resume to the prior status or cancel. Moving to `completed` requires both `employer_completed_at` and `worker_completed_at`.

## 6. Hard rules (enforced in the API, covered by tests)

1. **Tier eligibility is a filter, never a ranking** (§7, §13). Applying requires:
   - `ordinary`: active account with a worker profile
   - `skilled`: also at least one listed skill
   - `vip`: also `identity_verified` **and** `high_trust_approved` (admin decision). Rating never substitutes.
2. **Contact privacy** (§11): the other party's `phone` appears only in the `contact` field of a pairing response, only to the two parties, and only when the pairing is `confirmed`, `in_progress`, or `completed` (otherwise `contact` is `null`).
3. **Reviews** only for `completed` pairings, by a party to the pairing, once each (DB unique constraint).
4. **Admin routes** require `role = admin` (support gets read-only report access); every admin write goes to `audit_logs`.
5. New workers with zero reviews are never hidden from applicant lists (§15).
6. OTP: 6 digits, hashed, 5-minute expiry, max 5 attempts, rate-limited per IP and per phone.

## 7. API (REST, JSON, `/api` prefix)

| Module | Routes |
|---|---|
| auth | `POST /auth/otp/request`, `POST /auth/otp/verify`, `POST /auth/logout`, `GET /auth/me` |
| profiles | `PATCH /me` (username, language, active_mode), `GET /me/profile`, `PUT /me/worker-profile` (includes skill ids), `PUT /me/employer-profile`, `GET /users/:username` (public view with reviews) |
| catalog | `GET /categories`, `GET /skills`, `GET /stats` (real counts for the home page) |
| jobs | `GET /jobs` (filters: `q`, `category`, `tier`, `area`, `payType`, `minPay`, `when`, `near`+`radiusKm`, `eligibleOnly`), `GET /jobs/:id`, `POST /jobs`, `PATCH /jobs/:id`, `POST /jobs/:id/publish`, `POST /jobs/:id/cancel`, `GET /me/jobs` |
| applications | `POST /jobs/:id/applications`, `GET /jobs/:id/applications` (owner), `GET /me/applicants` (all my jobs), `POST /applications/:id/withdraw`, `POST /applications/:id/select`, `POST /applications/:id/reject`, `GET /me/applications` |
| pairings | `GET /me/pairings?role=`, `GET /pairings/:id`, `POST /pairings/:id/accept`, `POST /pairings/:id/decline`, `POST /pairings/:id/start`, `POST /pairings/:id/complete`, `POST /pairings/:id/cancel` |
| reviews | `POST /pairings/:id/reviews` (public reviews are part of `GET /users/:username`) |
| rebookings | `POST /pairings/:id/rebook`, `GET /me/rebookings`, `POST /rebookings/:id/accept`, `POST /rebookings/:id/decline` |
| reports | `POST /reports` |
| verification | `POST /verification`, `GET /me/verification` |
| notifications | `GET /notifications`, `POST /notifications/read` |
| admin | `GET /admin/overview`, `GET /admin/reports`, `POST /admin/reports/:id/resolve`, `GET /admin/verification`, `POST /admin/verification/:id/approve`, `POST /admin/verification/:id/reject`, `GET /admin/users?q=`, `POST /admin/users/:id/high-trust`, `POST /admin/users/:id/suspend`, `GET /admin/audit` |

Errors are always `{ "error": { "code": string, "message": string, "details"?: unknown } }`.

## 8. Web pages

`/` home (search, real stats, categories, latest jobs) · `/login` (phone → code → username/language on first login, honours `?next=`) · `/jobs` browse + filters · `/jobs/:id` detail + apply, or owner view with applicants, edit/publish/cancel · `/dashboard` worker mode (reputation, tier progression, rebooking requests, active jobs, applications) or employer mode (post job, my jobs, applicants, pairings, re-book) · `/pairings/:id` lifecycle, contact, complete, review, rebook, report · `/profile` account, worker profile + skills, employer profile, verification requests · `/u/:username` public profile · `/notifications` · `/admin` overview, verification, reports, users, audit log.

Creating and editing jobs happens in a modal (`PostJobModal`) rather than separate pages. Mobile-first layout with Tailwind 4 and lucide icons, following the supplied HojiiGO design.

## 9. Time-boxed milestones

| Time | Milestone | Done when |
|---|---|---|
| 0:00–0:20 | **M0 Scaffold** | `npm run dev` serves web + API; `GET /api/health` reports DB ok; migrations apply |
| 0:20–0:50 | **M1 Auth & profiles** | OTP login, session cookie, mode toggle, worker/employer profile forms |
| 0:50–1:20 | **M2 Jobs** | Post/publish/edit/cancel; browse with filters; tier copied from category |
| 1:20–1:55 | **M3 Apply → pair** | Apply, applicant list (no phone), select, worker accept, contact unlock, notifications |
| 1:55–2:20 | **M4 Complete, review, rebook** | Dual completion, one review per side, rebook creates new pairing on accept |
| 2:20–2:45 | **M5 Admin & safety** | Reports queue, verification approve/reject, high-trust grant, VIP gate, audit log |
| 2:45–3:00 | **M6 Prove it** | Seed script; Vitest + Supertest test runs the full §35 journey and the hard-rule negatives |

If time runs short, cut in this order: rebooking UI (keep API) → admin audit view → filters beyond category/area.

## 10. Before any real pilot (SRS §32, §36 — not code tasks)

- Pick an SMS/OTP provider available in Ethiopia; validate cost.
- Legal review: temporary labor, household and child-related work, payments/holding funds, personal data.
- Pick a payment provider and decide fee, cancellation, no-show, and refund rules.
- Confirm pilot categories and neighborhoods with worker/employer interviews.
- Get Amharic and Afaan Oromoo translations reviewed by native speakers.
- Keep VIP/child-related categories **disabled in production** until safeguarding requirements are confirmed.
