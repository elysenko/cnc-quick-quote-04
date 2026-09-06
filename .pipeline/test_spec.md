# Test Specification

> **WARNING — `surface.json` is stale template content.**
> `.pipeline/surface.json` still contains the scaffolder's placeholder routes
> (`GET /health`, `GET /trpc/users.findAll`, `GET /trpc/users.findById`) and placeholder
> `testIds` (`home-title`, `users-loading`, `users-list`). It does **not** describe this
> product. `backend_agent` and `ui_agent` are both tasked with rewriting it.
> This spec is therefore derived from the **Surface contract in `.pipeline/tasks.md`**,
> which is authoritative. The two surviving template routes are covered in
> **Out of scope** with their disposition.
>
> **WARNING — stack conflict.** The product spec prescribes FastAPI/Python + `ezdxf`
> with REST paths (`POST /api/quotes`, …). The scaffolder fixed the stack to
> Angular 19 + NestJS/tRPC/Prisma. Per `tasks.md`, data operations are **tRPC procedures**
> and only multipart/raw-body/public endpoints stay REST. All cases below target the
> scaffolded stack. Backend tests run under **Jest** (`backend/`), frontend under
> **`ng test`** (`frontend/`) — *not* pytest and *not* Vitest.
>
> **Path prefix caveat.** The scaffolded liveness route is mounted at `/health`
> (no global prefix); `tasks.md` calls it `/api/health`. Tests must follow whichever
> path the rewritten `surface.json` declares; both spellings are named below.

## Coverage summary
- Total cases: 255 — 214 API (`A-001`–`A-214`) + 20 data integrity (`D-001`–`D-020`) + 21 journey scenarios
- API endpoints covered: 45 / 45 (real surface per `tasks.md`; `surface.json` currently lists only 3, all template — see Out of scope)
  - REST: 6 · tRPC procedures: 39
- User journeys covered: 21

### Shared fixtures referenced throughout
Unless a case overrides them, tests seed these values.

| Fixture | Value |
|---|---|
| `PricingConfig` (id=1) | `costPerLinearFtCents=250`, `setupFeeCents=2500`, `handlingFeeCents=500`, `minOrderCents=5000`, `costPerBendCents=150` |
| `MachineConfig` (id=1) | `bedWMm=1500`, `bedHMm=1000`, `spacingMm=5`, `marginMm=10`, `animationSpeed=1.0`, `allowedExtensions=["dxf"]`, `maxUploadBytes=5242880`, `qtyMin=1`, `qtyMax=1000` |
| `Material` "Mild Steel 3mm" | `thicknessMm=3.0`, `sheetWMm=1000`, `sheetHMm=500`, `costMultiplier=1.0`, `isActive=true`, per-sheet cost `4000` cents |
| `Material` "Retired Alu" | same dims, `isActive=false` |
| `valid.dxf` | 1 LINE (0,0)→(100,0), 1 ARC r=10 sweeping 0→90°, 1 CIRCLE r=10 → `entityCount=3`, `cutLengthMm = 100 + 15.70796 + 62.83185 = 178.53981`, `bbox = 100mm × 50mm` |
| `quote_300mm.dxf` | pricing-arithmetic fixture — `entityCount=4`, `cutLengthMm = 300.0` exactly, `bbox = 100mm × 50mm` |
| `empty.dxf` | structurally valid, zero matched entities |
| `corrupt.dxf` | truncated/garbled header |
| `oversized_part.dxf` | bbox `1200mm × 50mm` (exceeds 1000mm sheet width) |
| Users | `admin@t.test` (role `ADMIN`), `user@t.test` (role `USER`), `other@t.test` (role `USER`, owns nothing) |

**Convention assertions applied to every money case:** amounts are integer cents; each
line item is rounded `ROUND_HALF_UP` *before* summing; mm→linear-feet uses `1 ft = 304.8 mm`.

---

## API tests

### `GET /health`  *(liveness; alias `/api/health` — follow rewritten surface.json)*
- **Happy path**: `A-001` no auth, no body → `200`, JSON containing `status: "ok"`. `A-002` responds while Redis and MinIO are unconfigured (liveness must not depend on them).
- **Validation failures**: `A-003` `POST /health` → `404`/`405`.
- **Auth failures**: n/a — public by contract; `A-004` asserts no `Authorization` header is required and no `401` is returned.
- **Idempotency / edge cases**: `A-005` two consecutive calls return identical shape; `A-006` p95 latency < 200 ms over 20 calls (liveness must not query Postgres).

### `GET /api/health/deep`
- **Happy path**: `A-007` all three dependencies up → `200`, body reports `postgres`, `redis`, `minio` each with `configured: true, reachable: true`.
- **Validation failures**: `A-008` unknown query params ignored, still `200`.
- **Auth failures**: `A-009` public — unauthenticated call returns `200`, not `401`.
- **Idempotency / edge cases**: `A-010` Postgres unreachable (client stubbed to throw) → `503` with `postgres.reachable: false` and the other services still reported. `A-011` `REDIS_API_KEY` unset/`PLACEHOLDER_CONFIGURE_IN_SETTINGS` → `redis.configured: false`, overall status degraded, **not** a 500. `A-012` MinIO bucket-missing → `minio.reachable: false`. `A-013` response returns within 5 s even when a dependency hangs (timeout guard).

### `POST /api/drawings`  *(REST, multipart)*
- **Happy path**: `A-014` `multipart/form-data` with `valid.dxf` + bearer token → `201`, body `{ id, filename, entityCount: 3, cutLengthMm ≈ 178.53981 (±0.01), bbox: {width:100, height:50} }`; `A-015` a `Drawing` row exists with `userId` = caller and a non-empty `storageKey`; `A-016` storage spy recorded exactly one `putObject` with the uploaded bytes.
- **Validation failures** (order matters — each asserts the storage spy recorded **zero** writes):
  `A-017` `.step` extension (not in `allowedExtensions`) → `422`, message names the allowed extensions.
  `A-018` file of `maxUploadBytes + 1` → `422` naming the size limit, **rejected before parsing** (parser spy not called).
  `A-019` `empty.dxf` (zero matched entities) → `422` with reason "no supported entities".
  `A-020` `corrupt.dxf` → `422` with the structural failure reason, not a `500`.
  `A-021` structural-audit errors present but a document was recovered → `422` (must not silently produce a garbage quote).
  `A-022` request with **no** file part → `422`.
  `A-023` request with `Content-Type: application/json` instead of multipart → `4xx` with a clear message, never `500`.
  `A-024` extension check precedes size check: a `.step` file that is *also* oversized reports the **extension** error.
- **Auth failures**: `A-025` no `Authorization` header → `401`. `A-026` malformed/expired bearer token → `401`.
- **Idempotency / edge cases**: `A-027` uploading the same file twice creates two distinct `Drawing` rows with distinct `storageKey`s. `A-028` rate limit — uploads past the configured window threshold → `429` with a `Retry-After` header. `A-029` MinIO unconfigured → `503` (`ServiceUnconfiguredError`), and no `Drawing` row is written.

### `POST /api/webhooks/stripe`  *(REST, raw body, public)*
- **Happy path**: `A-030` `checkout.session.completed` with a valid signature and re-retrieved session `payment_status: "paid"` → `200`; exactly one `Order` row created with populated `orderNumber`, `confirmationNumber`, `stripeSessionId`, `totalCents` matching the quote+shipping. `A-031` `checkout.session.async_payment_succeeded` with valid signature → `200` and an order created.
- **Validation failures**: `A-032` tampered `Stripe-Signature` → `400`, error logged, `Order.count() === 0`, `WebhookEvent.count() === 0`. `A-033` missing `Stripe-Signature` header → `400`. `A-034` body that is not valid JSON → `400`, no state change. `A-035` unhandled event type (e.g. `payment_intent.created`) → `200` with no order created. `A-036` request posted **without** the expected `Content-Type` still verifies (signature is computed over the raw body) — asserts raw-body middleware is registered for this route only.
- **Auth failures**: `A-037` no bearer token required — an unauthenticated valid-signature call succeeds (`200`), proving the route is exempt from `JwtAuthGuard`.
- **Idempotency / edge cases**: `A-038` the **same** `checkout.session.completed` delivered twice → both return `200`, `Order.count() === 1`, `WebhookEvent.count() === 1`. `A-039` two concurrent deliveries of the same event → unique-constraint violation on `WebhookEvent.stripeEventId` is swallowed, still exactly one order. `A-040` re-retrieved session with `payment_status: "unpaid"` → `200` acknowledged but **no** order created and the `Quote` remains intact/re-payable. `A-041` declined card (`checkout.session.async_payment_failed`) → no order, quote intact. `A-042` handler returns in < 10 s with the email client stubbed to hang (email must be deferred to a background task). `A-043` `WebhookEvent` row is inserted **before** order creation (ordering asserted via a transaction spy).

### `GET /api/branding`  *(REST, public)*
- **Happy path**: `A-044` unauthenticated → `200` with `companyName`, `logoUrl`, `primaryColor`, `accentColor`, `contactEmail`, `contactPhone`, `supportHours`, address block.
- **Validation failures**: `A-045` no `BusinessConfig` row yet → `200` with documented defaults, never `404`/`500`.
- **Auth failures**: `A-046` explicitly asserts **no** `401` without a token; `A-047` no secret fields (`stripeSecretKeyEnc`, `stripeWebhookSecretEnc`) appear anywhere in the payload.
- **Idempotency / edge cases**: `A-048` after `admin.businessConfig.update` changes `primaryColor`, the next call reflects the new value.

### `GET /api/receipts/:orderId`  *(REST)*
- **Happy path**: `A-049` owner requests own order → `200` HTML/PDF receipt containing order number, confirmation number, line items, and total; `A-050` `Content-Disposition`/`Content-Type` set for download.
- **Validation failures**: `A-051` non-existent `orderId` → `404`. `A-052` non-UUID/malformed id → `422` or `404`, never `500`.
- **Auth failures**: `A-053` unauthenticated → `401`. `A-054` a different `USER`'s order → `404` (not `403` — ownership must not leak existence). `A-055` `ADMIN` may fetch any order → `200`.
- **Idempotency / edge cases**: `A-056` two calls return byte-equivalent content for an unchanged order.

---

### tRPC procedures
> Transport note: each case is exercised through the tRPC HTTP endpoint. "Status" refers to
> the mapped HTTP status / tRPC error code pair asserted by the global exception filter:
> `401 UNAUTHORIZED`, `403 FORBIDDEN`, `409 CONFLICT`, `422 UNPROCESSABLE_CONTENT`,
> `429 TOO_MANY_REQUESTS`, `502 BAD_GATEWAY`, `503 PRECONDITION_FAILED`.

### `POST /trpc/auth.register`
- **Happy path**: `A-057` new email + valid password → `200`, access token + refresh token returned, `me` payload has `role: "USER"`; `A-058` the stored `password` column is a bcrypt hash (starts `$2`, cost 10) and never equals the plaintext; `A-059` no password field appears in the response.
- **Validation failures**: `A-060` malformed email → `422`. `A-061` password shorter than the documented minimum → `422`. `A-062` missing `email` or `password` → `422`.
- **Auth failures**: `A-063` duplicate email (exact) → `409`. `A-064` duplicate email differing only in case (`User@t.test`) → `409` (lowercase-uniqueness).
- **Idempotency / edge cases**: `A-065` when **no** `ADMIN` user exists, the first registrant is assigned `ADMIN`. `A-066` when an `ADMIN` already exists (platform seed), a new registrant is assigned `USER` — asserts the reconciled bootstrap rule.

### `POST /trpc/auth.login`
- **Happy path**: `A-067` correct credentials → `200` with a 15-minute access token and a 30-day opaque UUID refresh `jti`; `A-068` a matching `RefreshToken` row is persisted with `revokedAt: null`.
- **Validation failures**: `A-069` missing password → `422`.
- **Auth failures**: `A-070` wrong password → `401` with a generic message (must not distinguish "no such user"). `A-071` unknown email → `401` with the *same* message as `A-070`. `A-072` bcrypt comparison uses a constant-time compare and a failure never throws a `500`.
- **Idempotency / edge cases**: `A-073` two logins issue two distinct `jti`s and both remain valid.

### `POST /trpc/auth.refresh`
- **Happy path**: `A-074` valid unrevoked `jti` → `200` with a fresh access token.
- **Validation failures**: `A-075` missing/malformed `jti` → `422` or `401`.
- **Auth failures**: `A-076` `jti` past `expiresAt` → `401`. `A-077` `jti` with `revokedAt` set → `401`. `A-078` `jti` present in the Redis denylist but not yet in the DB → `401`. `A-079` unknown `jti` → `401`.
- **Idempotency / edge cases**: `A-080` refreshing does not extend the refresh token's own 30-day expiry beyond the original (or, if rotation is implemented, the old `jti` is revoked and reuse → `401`).

### `POST /trpc/auth.logout`
- **Happy path**: `A-081` authenticated logout → `200`; the `RefreshToken` row has `revokedAt` set **and** the `jti` is added to the Redis denylist. `A-082` a subsequent `auth.refresh` with that `jti` → `401`.
- **Validation failures**: `A-083` logout with an already-revoked `jti` → `200` (idempotent), no error.
- **Auth failures**: `A-084` unauthenticated → `401`.
- **Idempotency / edge cases**: `A-085` Redis unconfigured → logout still succeeds via DB-only revocation and `A-082` still holds (documented degradation).

### `GET /trpc/auth.me`
- **Happy path**: `A-086` valid token → `200` with `id`, `email`, `role`; `A-087` no password/hash field present.
- **Validation failures**: n/a (no input).
- **Auth failures**: `A-088` no token → `401`. `A-089` expired access token → `401`. `A-090` token signed with the wrong secret → `401`.
- **Idempotency / edge cases**: `A-091` after an admin changes the user's role, the next `me` reflects it.

### `GET /trpc/materials.list`
- **Happy path**: `A-092` → `200` with only `isActive: true` materials, each carrying `thicknessMm`, `sheetWMm`, `sheetHMm`; `A-093` "Retired Alu" is absent; `A-094` `costMultiplier` is **not** leaked to non-admin callers (pricing internals stay server-side) — if it is intentionally exposed, assert it explicitly.
- **Validation failures**: n/a.
- **Auth failures**: `A-095` unauthenticated → `401`.
- **Idempotency / edge cases**: `A-096` zero active materials → `200` with an empty array (drives the UI empty state), never `404`.

### `GET /trpc/drawings.get`
- **Happy path**: `A-097` owner fetches own drawing → `200` with `bbox`, `cutLengthMm`, `entityCount`, `filename`.
- **Validation failures**: `A-098` malformed id → `422`.
- **Auth failures**: `A-099` unauthenticated → `401`. `A-100` another user's drawing → `404`. `A-101` non-existent id → `404` (identical body to `A-100`).
- **Idempotency / edge cases**: `A-102` response includes a presigned download URL only if the spec requires it; if present, assert its expiry is bounded.

### `GET /trpc/drawings.listMine`
- **Happy path**: `A-103` → `200` returning only the caller's drawings, newest first.
- **Validation failures**: `A-104` invalid pagination args → `422`.
- **Auth failures**: `A-105` unauthenticated → `401`; `A-106` `other@t.test` sees an empty list while `user@t.test` has drawings.

### `POST /trpc/bends.create`
- **Happy path**: `A-107` `{drawingId, startX:0, startY:0, endX:50, endY:0, angleDeg:90, direction:"UP"}` → `200` with a new `BendLine` row; `A-108` the stored DXF object in MinIO is byte-identical afterwards (never mutated).
- **Validation failures**: `A-109` `angleDeg: 181` → `422`. `A-110` `angleDeg: -1` → `422`. `A-111` `angleDeg: 0` and `A-112` `angleDeg: 180` → accepted (inclusive bounds). `A-113` `direction: "sideways"` → `422`. `A-114` missing coordinate → `422`. `A-115` zero-length bend (start == end) → `422`.
- **Auth failures**: `A-116` unauthenticated → `401`. `A-117` bend on another user's drawing → `404`.
- **Idempotency / edge cases**: `A-118` creating a second bend on the same drawing yields two rows, and the next `quotes.create` total increases by exactly `costPerBendCents`.

### `POST /trpc/bends.update`
- **Happy path**: `A-119` move a bend's endpoints and change `angleDeg` → `200` with updated values persisted.
- **Validation failures**: `A-120` update to `angleDeg: 200` → `422` and the row is unchanged.
- **Auth failures**: `A-121` unauthenticated → `401`. `A-122` another user's bend → `404`.

### `POST /trpc/bends.delete`
- **Happy path**: `A-123` delete → `200`; `A-124` `bends.listForDrawing` no longer returns it; `A-125` a recomputed quote total drops by exactly `costPerBendCents`.
- **Validation failures**: `A-126` deleting an already-deleted id → `404`.
- **Auth failures**: `A-127` unauthenticated → `401`. `A-128` another user's bend → `404`.

### `GET /trpc/bends.listForDrawing`
- **Happy path**: `A-129` → `200` with all bends for the drawing in stable order.
- **Auth failures**: `A-130` unauthenticated → `401`. `A-131` another user's drawing → `404`.
- **Idempotency / edge cases**: `A-132` drawing with no bends → `200` empty array.

### `GET /trpc/nesting.preview`
- **Happy path**: `A-133` bbox `100×50`, qty `10`, "Mild Steel 3mm" → `cols = floor((1000-20+5)/(100+5)) = 9`, `rows = floor((500-20+5)/(50+5)) = 8`, `perSheet = 72`, `sheets = 1`, and a `placements` array of length 10 with top-left-origin coordinates, first at `(10, 10)`. `A-134` `utilization` returned as a ratio in `(0,1]`, equal to `(10 × 100 × 50) / (1000 × 500)` = `0.1`.
- **Validation failures**: `A-135` `oversized_part.dxf` bbox `1200×50` (partW > sheetW) → `422`, message names the sheet dimension. `A-136` part taller than the sheet (`50×600`) → `422`. `A-137` inactive material id → `422`. `A-138` qty `0` → `422`. `A-139` part exactly equal to the usable area after margins → accepted with `perSheet = 1`.
- **Auth failures**: `A-140` unauthenticated → `401`.
- **Idempotency / edge cases**: `A-141` qty `145` → `sheets === 3` (`ceil(145/72)`). `A-142` **no `Quote` row is created** by a preview call, including the `422` cases. `A-143` two identical previews return identical placements (deterministic top-left packing).

### `POST /trpc/quotes.create`
- **Happy path**: `A-144` drawing `quote_300mm.dxf` (`cutLengthMm = 300`), qty `10`, 2 bends, "Mild Steel 3mm" → `200` with hand-computed breakdown in cents:
  `setup 2500` + `cutting 2461` (`300mm × 10 = 3000mm = 9.84252 ft × 250 = 2460.63 → 2461`) + `material 4000` (`1 sheet × 4000 × 1.0`) + `handling 500` + `bends 300` (`2 × 150`) = **`totalCents = 9761`**.
  `A-145` `breakdown` returns those five labelled line items summing exactly to `totalCents`. `A-146` `nesting` JSON persisted with `sheets: 1`, `perSheet: 72`. `A-147` `pricingSnapshot` persisted containing all five pricing fields at their current values.
- **Validation failures**: `A-148` inactive material id → `422`, no `Quote` row. `A-149` qty `0` → `422` with `qtyMin` stated in the message. `A-150` qty `-5` → `422`. `A-151` qty `null`/omitted → `422`. `A-152` qty `1001` (> `qtyMax`) → `422` with `qtyMax` stated. `A-153` qty non-integer (`2.5`) → `422`. `A-154` unknown `drawingId` → `404`. `A-155` part wider than sheet → `422` and `Quote.count()` unchanged. `A-156` sub-minimum sum (pricing zeroed except `costPerLinearFtCents=100`, qty 1, 100mm cut, 0 bends → raw `33` cents) returns exactly `totalCents === 5000` (`minOrderCents`), with the breakdown showing a `minimum order adjustment` line.
- **Auth failures**: `A-157` unauthenticated → `401`. `A-158` quoting another user's drawing → `404`.
- **Idempotency / edge cases**: `A-159` after the quote is created, `admin.pricingConfig.update` changes `costPerLinearFtCents` to `500`; re-reading the quote via `quotes.getById` still returns `totalCents === 9761` and the original `pricingSnapshot` (**snapshot immutability**). `A-160` rate limit — creates past the window threshold → `429` with `Retry-After`. `A-161` p95 latency < 3 s over 20 creates (path is pure arithmetic; parsing happened at upload).

### `GET /trpc/quotes.list`
- **Happy path**: `A-162` → `200` with only the caller's quotes; `A-163` `page=2&sort=createdAt:desc` returns the correct slice and ordering with a total count for the pager.
- **Validation failures**: `A-164` `page=0` or negative → `422`. `A-165` unknown `sort` key → `422` (or documented fallback, asserted explicitly).
- **Auth failures**: `A-166` unauthenticated → `401`.
- **Idempotency / edge cases**: `A-167` user with zero quotes → `200` empty array + `total: 0`.

### `GET /trpc/quotes.getById`
- **Happy path**: `A-168` owner → `200` with `breakdown`, `nesting`, `pricingSnapshot`, `totalCents`. `A-169` `ADMIN` fetching any user's quote → `200`.
- **Auth failures**: `A-170` unauthenticated → `401`. `A-171` a different `USER` → `404`. `A-172` unknown id → `404`.

### `GET /trpc/shippingMethods.list`
- **Happy path**: `A-173` two active methods against a quote with `sheets = 3` → the `FLAT` method at `amountCents = 1500` returns `1500` unchanged; the `PER_SHEET` method at `amountCents = 900` returns a computed `2700` (`900 × 3`); both carry `estDeliveryDays`.
- **Validation failures**: `A-174` missing/unknown `quoteId` → `422`/`404` (per-sheet cost cannot be computed without the sheet count).
- **Auth failures**: `A-175` unauthenticated → `401`.
- **Idempotency / edge cases**: `A-176` **zero active methods** → an explicit blocked state (`blocked: true` + the contact-the-company message), *not* an empty list silently treated as "free shipping". `A-177` inactive methods never appear.

### `POST /trpc/checkout.createSession`
- **Happy path**: `A-178` valid quote + shipping method → `200` returning `session.url`; the mocked Stripe client received `mode: "payment"`, a quote line item at `totalCents`, a shipping line item at the computed cost, `success_url` containing `/orders/{CHECKOUT_SESSION_ID}/confirmation?session_id={CHECKOUT_SESSION_ID}`, and `cancel_url` containing `/checkout/{quoteId}/payment?cancelled=1`.
- **Validation failures**: `A-179` unknown `quoteId` → `404`. `A-180` shipping method that is inactive → `422`. `A-181` no shipping method selected while methods exist → `422`. `A-182` creating a session when zero methods are active → blocked `422` with the contact-company message.
- **Auth failures**: `A-183` unauthenticated → `401`. `A-184` another user's quote → `404`.
- **Idempotency / edge cases**: `A-185` mocked Stripe timeout/`APIError` → `502` with a retry message **and `Order.count() === 0`**. `A-186` Stripe unconfigured (placeholder key) → `503`, no order. `A-187` rate limit exceeded → `429` with `Retry-After`. `A-188` **no `Order` row is written by this procedure under any outcome** — orders originate only from the verified webhook.

### `GET /trpc/orders.list`
- **Happy path**: `A-189` → `200` with the caller's orders (status, `totalCents`, `orderNumber`, link id), newest first.
- **Auth failures**: `A-190` unauthenticated → `401`; `A-191` a user never sees another user's orders.
- **Idempotency / edge cases**: `A-192` zero orders → `200` empty array.

### `GET /trpc/orders.getById`
- **Happy path**: `A-193` owner → `200` with order + confirmation numbers, email, shipping address, estimated delivery, and the business contact block.
- **Auth failures**: `A-194` unauthenticated → `401`. `A-195` another `USER` → `404`. `A-196` `ADMIN` → `200`.

### `GET /trpc/orders.getBySessionId`
- **Happy path**: `A-197` the `session_id` returned in `success_url` resolves to the order → `200`.
- **Validation failures**: `A-198` unknown session id → `404`. `A-199` session id belonging to a session whose webhook has not yet arrived → a documented `pending` state (or `404`), asserted explicitly so the confirmation page can poll rather than crash.
- **Auth failures**: `A-200` unauthenticated → `401`. `A-201` another user's session id → `404`.

### Admin procedures — `admin.materials.{list,create,update,delete}`
- **Happy path**: `A-202` `create` with name/thickness/sheet W/H/cost multiplier/active → `200` and the row appears in `admin.materials.list`. `A-203` `update` toggling `isActive: false` removes it from the public `materials.list` but keeps it in `admin.materials.list`. `A-204` `delete` removes it.
- **Validation failures**: `A-205` negative `thicknessMm`, zero `sheetWMm`, or negative `costMultiplier` → `422`. `A-206` duplicate material name → `409`/`422` per implementation, asserted explicitly. `A-207` deleting a material referenced by an existing `Quote` → either blocked (`422`) or soft-deactivated; asserted so historical quotes never break.
- **Auth failures**: `A-208` `USER` token → `403` on all four. `A-209` no token → `401` on all four.

### Admin procedures — `admin.pricingConfig.{get,update}`
- **Happy path**: `A-210` `get` on a fresh DB materialises and returns the `id=1` singleton defaults. `A-211` `update` persists all five fields and a subsequent `get` echoes them.
- **Validation failures**: `A-212` negative `minOrderCents` or non-integer cents → `422`. `A-213` `update` never creates a second row (`PricingConfig.count() === 1`).
- **Auth failures**: `A-214` `USER` → `403`; no token → `401` (covered in the RBAC sweep, `A-208`/`A-209` pattern).

### Admin procedures — `admin.machineConfig.{get,update}`
- **Happy path**: `get` returns the `id=1` singleton with bed dims, spacing, margins, animation speed, allowed extensions, max upload size, qty bounds; `update` persists them and immediately affects upload validation (`A-018` re-run against a lowered `maxUploadBytes`).
- **Validation failures**: `qtyMin > qtyMax` → `422`; `marginMm` larger than half the bed → `422`; empty `allowedExtensions` → `422`; `maxUploadBytes <= 0` → `422`.
- **Auth failures**: `USER` → `403`; no token → `401`.
- **Idempotency / edge cases**: singleton count stays `1` across repeated updates.

### Admin procedures — `admin.businessConfig.{get,update}`
- **Happy path**: `update` sets company name, logo, primary/accent colour, contact details, support hours; `GET /api/branding` reflects them (`A-048`).
- **Validation failures**: malformed hex colour → `422`; malformed `contactEmail` → `422`.
- **Auth failures**: `USER` → `403`; no token → `401`.

### Admin procedures — `admin.paymentConfig.{get,update}`
- **Happy path**: `update` with a Stripe secret + webhook secret → stored **encrypted at rest** (the raw DB column never contains the plaintext) and `get` returns them **masked to the last 4 characters**.
- **Validation failures**: a secret that fails the expected key-shape check → `422`; `sandboxMode` non-boolean → `422`.
- **Auth failures**: `USER` → `403`; no token → `401`.
- **Idempotency / edge cases**: when the env var is set, **env wins over the stored value** for the runtime client; `get` still masks; the route is rate-limited (`429` past threshold).

### Admin procedures — `admin.shippingMethods.{list,create,update,delete}`
- **Happy path**: create a `FLAT` and a `PER_SHEET` method; both appear in the public `shippingMethods.list` with correct computed costs; deactivating both triggers the blocked state (`A-176`).
- **Validation failures**: negative `amountCents` → `422`; `estDeliveryDays` negative or non-integer → `422`; unknown `rateType` → `422`.
- **Auth failures**: `USER` → `403`; no token → `401`.

### Admin procedures — `admin.settings.{list,update}`
- **Happy path**: `list` returns one row per service (`postgresql`, `minio`) and per integration env key (`MINIO_S3_COMPATIBLE_OBJECT_STORAGE_MINIO_SDK_API_KEY`, `POSTGRESQL_API_KEY`, `REDIS_API_KEY`, `RESEND_API_RESEND_SDK_API_KEY`, `STRIPE_PYTHON_SDK_STRIPECLIENT_V15_6_API_KEY`) with a masked value and a `configured` boolean; `update` upserts a `SystemSetting` and flips `configured` to `true`.
- **Validation failures**: unknown key → `422`; empty value → `422`.
- **Auth failures**: `USER` → `403`; no token → `401`.
- **Idempotency / edge cases**: `resolveConfig` precedence — env var wins over the DB row; a value of `PLACEHOLDER_CONFIGURE_IN_SETTINGS` is treated as **unset** (`configured: false`); with neither set, the dependent integration raises `ServiceUnconfiguredError` → `503`; masking never reveals more than the last 4 characters; repeated `update` on the same key updates in place (`SystemSetting.count()` unchanged).

### Cross-cutting API sweeps
- **RBAC sweep**: parametrized over **all 18 admin procedures** (4 materials + 2 pricingConfig + 2 machineConfig + 2 businessConfig + 2 paymentConfig + 4 shippingMethods + 2 settings) — each asserts `403` for a `USER` token, `401` for no token, `200`/`2xx` for an `ADMIN` token. A failure to enumerate every admin procedure fails the test (the list is derived from the router registry, not hard-coded).
- **Rate-limit sweep**: for each of `POST /api/drawings`, `quotes.create`, `checkout.createSession`, and `admin.paymentConfig.update` — loop past the configured threshold, assert `429` and a `Retry-After` header; assert the counter resets after the window; assert keying by `userId` when authenticated and by client IP when not.
- **Error-mapping sweep**: domain error → `422`, auth → `401`, role → `403`, rate limit → `429`, unconfigured integration → `503`, upstream payment failure → `502`; no unhandled path returns `500` with a stack trace in the body.

---

## UI / journey tests

### Journey: Signup and first-admin bootstrap
- **Steps**: navigate `/signup` → type email + password → submit.
- **Expected outcomes**: redirect to `/quote/new/upload`; session established; when no `ADMIN` exists the user lands with admin nav visible; when an `ADMIN` already exists the admin nav is absent.
- **Negative path**: duplicate email → inline `409` message "an account with this email already exists", form stays on `/signup`, password field not cleared-and-lost silently; invalid email → inline validation before submit; server `500` → generic error banner, no navigation.

### Journey: Login, session refresh, and logout
- **Steps**: `/login` → submit correct credentials → land on `/quote/new/upload` → let the access token expire → trigger any data call → logout.
- **Expected outcomes**: on expiry the `authInterceptor` transparently refreshes **once** and replays the original request without a visible error; logout clears the session and redirects to `/login`; the back button after logout does not restore an authenticated page.
- **Negative path**: wrong password → `401` inline message, no redirect; refresh itself failing `401` → single redirect to `/login` with `returnUrl` preserved (assert **no** infinite refresh loop — the interceptor retries at most once).

### Journey: Route addressability and guards
- **Steps**: assert every route in `app.routes.ts` programmatically; visit a protected URL while logged out; visit `/admin/materials` as a `USER`.
- **Expected outcomes**: **every** route object carries a non-empty `data.flow`; every path in the Surface contract is present; `authGuard` redirects an unauthenticated visitor to `/login?returnUrl=…` and returns there after login; `adminGuard` redirects a non-admin away from `/admin/**`; `''` redirects to `/quote/new/upload`; `**` renders the not-found page; modals are addressable as `?modal=<name>` and detail panes as `?panel=<name>` (deep-linking directly to the URL opens them); list filters round-trip through query params.
- **Negative path**: an unknown `?modal=` value renders the page without a modal rather than crashing.

### Journey: Quote wizard — upload step
- **Steps**: `/quote/new/upload` → drag `valid.dxf` onto the dropzone (and separately, via the file picker) → observe progress → auto-advance.
- **Expected outcomes**: extension/size hints shown are sourced from machine config; progress indicator renders; on success the parsed **entity count** is displayed (so a near-empty parse is visible) and the URL advances to `/quote/new/material`.
- **Negative path**: `.step` file → inline `422` naming allowed extensions, no navigation; oversize file → `422` naming the limit; `corrupt.dxf`/`empty.dxf` → the server's parse-failure reason rendered verbatim, wizard stays on the upload step; `429` → "too many uploads, retry in N seconds" using `Retry-After`; `503` → the unconfigured-storage message.

### Journey: Quote wizard — material and quantity step
- **Steps**: `/quote/new/material` → choose "Mild Steel 3mm" → enter quantity `10` → next.
- **Expected outcomes**: only active materials listed, each showing thickness and sheet dimensions; quantity input shows min/max bounds from machine config; URL advances to `/quote/new/bends`.
- **Negative path**: quantity `0`, `-5`, blank, or `1001` → inline error quoting the offending bound, next blocked; zero active materials → empty state directing the customer to contact the company, next blocked; direct navigation to `/quote/new/material` without an uploaded drawing → guarded back to `/quote/new/upload`.

### Journey: Quote wizard — bend editor canvas
- **Steps**: `/quote/new/bends` → click-drag on the canvas to place a bend → select it → set angle `90` and direction `up` → drag to move → rotate → delete → next.
- **Expected outcomes**: parsed geometry renders on the raw Canvas 2D surface; each placed bend appears in the bend list and is persisted via `bends.create`; move/rotate issue `bends.update`; delete issues `bends.delete` and removes it from the list; the pending quote total reflects `bendCount × costPerBendCents`.
- **Negative path**: entering angle `181` or `-1` → inline validation, no API call (or a `422` surfaced inline); a failed persist leaves the canvas and the list consistent (no orphaned local-only bend); the step is skippable with zero bends.

### Journey: Quote wizard — result step, work bed, and laser animation
- **Steps**: `/quote/new/result` → observe the animation auto-start → click **Print Bed** → click it again → resize the window.
- **Expected outcomes**: line-item breakdown matching the API (`A-145`), sheet count and utilization shown; the work bed renders the machine bed, sheet outline, nested part instances, **cut paths in blue solid**, **bend lines in orange dashed**, and labels; the `requestAnimationFrame` loop advances the laser head at `machineConfig.animationSpeed` and draws completed vs remaining cuts distinctly; animation **starts automatically on load**; **Print Bed toggles start ↔ stop-and-reset** (after stopping, the head is back at the path origin and zero cuts are marked complete, asserted on the canvas state — not just a boolean flag); `ResizeObserver` + devicePixelRatio scaling redraws with no clipping and no aspect distortion at DPR 1, 2, and 3.
- **Negative path**: a multi-sheet nest (`sheets = 3`) renders all three sheets with correct counts; a nest with hundreds of instances still budgets per-frame draw work (static layers pre-rendered offscreen; assert the offscreen canvas is created once, not per frame); "Proceed to checkout" navigates to `/checkout/:quoteId/review`.
- **Unit-level**: nesting-to-canvas coordinate mapping is unit-tested — a placement at nesting origin `(10, 10)` maps to the expected device pixel under a known scale/DPR, and the mapping is invertible.

### Journey: Quotes list and detail
- **Steps**: `/quotes` → change page → change sort → open a quote.
- **Expected outcomes**: `?page=` and `?sort=` are written to the URL and survive a hard reload; the detail page at `/quotes/:id` shows breakdown and nesting.
- **Negative path**: loading, empty ("no quotes yet" with a CTA to the wizard), and error states each render; another user's quote id → not-found state, not a crash.

### Journey: Checkout — review
- **Steps**: `/checkout/:quoteId/review` → confirm → next.
- **Expected outcomes**: material, quantity, and total displayed matching the quote; advancing goes to `/checkout/:quoteId/shipping`.
- **Negative path**: unauthenticated deep link → `/login` with `returnUrl`; unknown `quoteId` → not-found state.

### Journey: Checkout — shipping
- **Steps**: `/checkout/:quoteId/shipping` → select a method → next.
- **Expected outcomes**: active methods listed with **computed** cost (flat, or per-sheet × sheet count) and estimated delivery; selection persists into the payment step.
- **Negative path**: **zero active methods → a blocking error directing the customer to contact the company, and the next action is disabled** (no unpriced order may proceed); attempting to skip directly to `/checkout/:quoteId/payment` in that state is also blocked.

### Journey: Checkout — payment and Stripe redirect
- **Steps**: `/checkout/:quoteId/payment` → click pay → (mocked) redirect to the Stripe hosted session → return via `cancel_url`.
- **Expected outcomes**: the app redirects to the `session.url` returned by `checkout.createSession`.
- **Negative path**: Stripe `502` → a retry message with the action re-enabled and **no order created**; `503` unconfigured → the configure-integration message; returning with `?cancelled=1` renders a "payment cancelled" state with the **quote intact** and the pay action available again (no re-entry of earlier steps).

### Journey: Order confirmation
- **Steps**: land on `/orders/:id/confirmation?session_id=…` after webhook fulfilment → click the receipt download.
- **Expected outcomes**: order number, confirmation number, customer email, shipping address, estimated delivery, and the business contact block all render; the receipt link resolves to `GET /api/receipts/:orderId`.
- **Negative path**: **a Resend email failure still renders a complete confirmation page** (email is fire-and-forget); arriving before the webhook has been processed shows a pending/polling state rather than an error; another user's session id → not-found.

### Journey: Orders list
- **Steps**: `/orders`.
- **Expected outcomes**: the customer's orders with status, total, and a link to each confirmation.
- **Negative path**: loading, empty, and error states render; only the caller's orders appear.

### Journey: Admin — materials CRUD
- **Steps**: `/admin/materials` as `ADMIN` → open the create dialog via `?modal=create` → save → edit → delete via the confirm dialog.
- **Expected outcomes**: the table reflects each change; dialogs are URL-addressed (`?modal=…`) and deep-linkable; a deactivated material disappears from the customer material step.
- **Negative path**: `422` validation errors render inline in the dialog; the confirm dialog can be cancelled without deleting; a `USER` navigating here is redirected by `adminGuard`.

### Journey: Admin — pricing and machine configuration
- **Steps**: `/admin/pricing` → change `costPerLinearFtCents` → save; `/admin/machine` → change `maxUploadBytes`, `qtyMax`, `animationSpeed` → save.
- **Expected outcomes**: values persist across reload; the new upload limit is enforced on the next upload; the new `qtyMax` is surfaced in the material step; **an existing quote's total is unchanged** by the pricing edit.
- **Negative path**: `qtyMin > qtyMax` → inline `422`; empty allowed-extensions list → inline `422`.

### Journey: Admin — business branding, payment, and shipping tabs
- **Steps**: `/admin/business/branding` → set company name and primary/accent colours → save; `/admin/business/payment` → enter a Stripe secret → save → reload; `/admin/business/shipping` → create a `PER_SHEET` method.
- **Expected outcomes**: each tab is its own URL and is deep-linkable; branding changes apply as CSS custom properties across the shell without a full reload and appear in the confirmation email payload; the Stripe secret input is **write-only** and displays only the last 4 characters after save; the new shipping method appears in customer checkout with its computed cost.
- **Negative path**: malformed hex colour → inline `422`; a masked value is never echoed back into the input as if it were the real secret (re-saving the mask must not overwrite the stored key).

### Journey: Admin — settings and unconfigured-credential banner
- **Steps**: `/admin/settings` → read the banner → enter a credential for one integration → save.
- **Expected outcomes**: one row per provisioned service (`postgresql`, `minio`) and per integration (MinIO / S3-compatible object storage, PostgreSQL, Redis, Resend API, Stripe Python SDK), each with a configured/unconfigured badge and a credential form; the banner reads "The following need credentials to activate: Stripe Python SDK (`StripeClient`, v15.6), Resend API (`resend` SDK), MinIO / S3-compatible object storage (`minio` SDK), PostgreSQL, Redis."; after saving one credential **that entry's badge flips to configured and it is removed from the banner**; when all are configured the banner disappears entirely.
- **Negative path**: a `USER` is redirected by `adminGuard`; a save failure leaves the badge unchanged and shows an error.

### Journey: Branding applied to the SPA shell
- **Steps**: bootstrap the app with a `BusinessConfig` present, and again with none.
- **Expected outcomes**: `branding.service` fetches `GET /api/branding` **once** at bootstrap and writes `--primary` / `--accent` CSS custom properties; company name and logo render in the shell.
- **Negative path**: branding endpoint failing or returning empty → sane documented defaults are applied and the app still renders (no blank shell, no unstyled flash-of-broken-theme).

### Journey: End-to-end happy path
- **Steps**: signup → upload `valid.dxf` → select material + quantity `10` → add one bend → view result + work bed → review → shipping → mocked Stripe redirect → replay the `checkout.session.completed` webhook → confirmation → `/orders`.
- **Expected outcomes**: the confirmation page shows the order and confirmation numbers; the order appears in `/orders` with status `PAID`; exactly one `Order` row exists; the total charged equals quote total + shipping cost.
- **Negative path**: replaying the webhook a second time does not create a second order and the confirmation page is unchanged.

### Journey: End-to-end admin path
- **Steps**: admin logs in → edits pricing and machine config → creates a material and a shipping method → sets a credential on `/admin/settings`.
- **Expected outcomes**: each change is visible to a customer session immediately (new material selectable, new shipping method priced at checkout); the unconfigured banner clears for the configured entry.
- **Negative path**: a customer session performing the same navigations is blocked at every admin route.

### Journey: Template-content removal (scaffold acceptance gate)
- **Steps**: render the app shell and home route.
- **Expected outcomes**: the `app-ready` test id remains on the root shell; **none** of the `.colossus-acceptance.json` `reject_signatures` appear anywhere in the rendered DOM — `home-title">Users<`, `Loading...`, `Failed to load users.`; every page root, list, empty state, error state, and primary action carries a `data-testid`, and those ids match the rewritten `surface.json`.
- **Negative path**: a leftover template string anywhere in the rendered output fails the gate.

---

## Data integrity tests
- `D-001` **Money is always integer cents.** No `Quote.totalCents`, `Order.totalCents`, config `*Cents`, or breakdown line item is ever a float; a property-based sweep over 200 random pricing inputs asserts integrality and that the breakdown sums exactly to the total.
- `D-002` **Rounding is `ROUND_HALF_UP` per line item.** A cut length landing exactly on a half-cent (e.g. `…×250 = 2460.5`) rounds to `2461`, not `2460`.
- `D-003` **Unit discipline.** Dimensions are stored and transported in millimetres; the mm→linear-feet conversion (`/304.8`) appears only inside the pricing service — asserted by a source-level check plus a unit test that pricing is the sole consumer.
- `D-004` **Pricing snapshot immutability.** After `admin.pricingConfig.update`, every pre-existing `Quote.totalCents` and `pricingSnapshot` is byte-identical to its pre-update value.
- `D-005` **Exactly one order per Stripe session.** `Order.stripeSessionId` is unique; concurrent duplicate webhook deliveries leave `Order.count() === 1`.
- `D-006` **Webhook idempotency key.** `WebhookEvent.stripeEventId` is the primary key; a duplicate insert raises a unique violation that is caught and answered `200`; the row is written **before** any order mutation.
- `D-007` **Order numbers are unique.** `orderNumber` and `confirmationNumber` are unique across 100 concurrently created orders, with no collisions and no nulls.
- `D-008` **No order without payment.** After any `checkout.createSession` failure path (`502`, `503`, `429`), `Order.count()` is unchanged; after a webhook with `payment_status: "unpaid"`, `Order.count()` is unchanged.
- `D-009` **Quote survives a failed payment.** The `Quote` row and its `totalCents` are unchanged after a declined card or a cancelled session, so the customer can retry.
- `D-010` **Config singletons.** `PricingConfig`, `MachineConfig`, `BusinessConfig`, and `PaymentConfig` each hold exactly one row with `id = 1` after any sequence of `get`/`update` calls.
- `D-011` **Refresh-token revocation is durable.** A revoked `jti` has `revokedAt` set in Postgres *and* is present in the Redis denylist; after a Redis flush, the DB check alone still rejects it.
- `D-012` **Cascade deletes.** Deleting a `User` cascades to `RefreshToken`; deleting a `Drawing` cascades to its `BendLine` rows; no orphaned `BendLine` exists after any delete path.
- `D-013` **Referential integrity of historical records.** A `Quote` always resolves its `drawingId`, `materialId`, and `userId`; deactivating or deleting a material never orphans an existing quote or order.
- `D-014` **The stored DXF is immutable.** The MinIO object bytes for a drawing are identical before and after any bend create/update/delete; bends live only in `BendLine` rows.
- `D-015` **No storage write on rejected upload.** After every `422` upload path, the storage spy has zero `putObject` calls and `Drawing.count()` is unchanged.
- `D-016` **Email failure never rolls back an order.** With the Resend client stubbed to throw, the `Order` row is committed, the confirmation payload renders, and the failure is logged.
- `D-017` **Secrets at rest.** A direct DB read of `PaymentConfig.stripeSecretKeyEnc` / `stripeWebhookSecretEnc` and of `SystemSetting.value` never returns the plaintext credential; no API response contains more than the last 4 characters.
- `D-018` **Email uniqueness is case-insensitive.** `User@t.test` and `user@t.test` cannot both exist.
- `D-019` **Ownership is enforced at the data layer.** A parametrized sweep proves no `quotes`, `drawings`, `bends`, or `orders` query returns a row whose `userId` differs from the caller, unless the caller is `ADMIN`.
- `D-020` **`ColossusAccount` is untouched.** Its schema and rows are unchanged by every migration and every code path in this feature.

---

## Out of scope
- **`GET /trpc/users.findAll` and `GET /trpc/users.findById`** — scaffolder template procedures. `backend_agent` is tasked with replacing the `users.*` surface; they are listed in the stale `surface.json` but are not part of this product. **If they still exist when tests run, a single case asserts they have been removed** (or, if retained as a platform contract, that they are admin-guarded and leak no password hashes).
- **The spec's FastAPI/Python surface** (`api/app/**`, `POST /api/quotes`, `POST /api/drawings/{id}/bends`, pytest fixtures, `ezdxf`/`auditor.has_errors`/`bbox.multi_recursive` semantics) — not built; the scaffolded NestJS stack is authoritative per `tasks.md` Open questions.
- **Angular 22 / zoneless / Vitest specifics** — the scaffold is Angular 19 with a frozen `package.json`; tests use `ng test`, and no new frontend dependency may be introduced by a test.
- **`k8s/` manifests, `Dockerfile.api`, `Dockerfile.web`, `nginx.conf` from the spec's Step 1** — the scaffold ships `backend/Dockerfile`, `frontend/Dockerfile`, `frontend/nginx.conf`, and `colossus.yaml`; deployment is the deploy agent's contract, not covered here.
- **`MANAGER` role permissions** — the platform fixes `enum Role { USER MANAGER ADMIN }` but `tasks.md` leaves `MANAGER` unused. No cases are written until the open question is resolved; the RBAC sweep covers `USER` and `ADMIN` only.
- **Per-sheet material cost source.** The spec's pricing formula uses `per_sheet_cost`, but no such field exists in the `PricingConfig` field list in `tasks.md`. Cases `A-144`–`A-147` assume a `perSheetCostCents` of `4000` sourced from pricing config; **if the implementation instead derives it from the material, the fixture and expected total (`9761`) must be recomputed.** Flagged as a blocking ambiguity for the tester agent.
- **Receipt document format.** `tasks.md` assumes server-rendered HTML behind `GET /api/receipts/:orderId`; PDF rendering fidelity, pagination, and print styling are untested because the spec is silent.
- **Stripe encryption key source.** `tasks.md` assumes an app-level `ENCRYPTION_KEY` env var; key rotation and re-encryption are untested — the spec is silent.
- **Redis provisioning.** Redis is not a provisioned deployment; cases `A-011`, `A-085`, and `D-011` cover the documented in-process/DB-only degradation, but true distributed rate-limit correctness across multiple API replicas is untested.
- **Real Stripe, Resend, and MinIO network calls.** All three SDKs are mocked/stubbed; live-provider contract drift is untested.
- **DXF entity types beyond the five specified** (`SPLINE`, `INSERT`/block references, `ELLIPSE`, `TEXT`) — deliberately unparsed. One case (`A-014`) asserts the **entity count is surfaced** so a near-empty parse is visible to the customer, but under-counted cut length for such files is accepted behaviour, not a bug.
- **Sustained 60 FPS under load** — asserted structurally (offscreen pre-render created once, per-frame work bounded) rather than by wall-clock frame timing, which is too flaky for CI.
- **Accessibility, i18n, and cross-browser rendering** — the spec is silent on all three.
