# FieldVerify

**Intelligent Vehicle Evidence Verification**

FieldVerify accepts uploaded vehicle field photographs, processes them
asynchronously, and returns an explainable **Evidence Integrity Score**
with a recommendation of `ACCEPT`, `REVIEW`, or `REJECT`. It surfaces
*evidence signals*, not legal or forensic determinations — the goal is
reliable, explainable engineering around uncertain image-analysis
signals, not perfect ML accuracy.

---

## Table of contents

1. [Project overview](#project-overview)
2. [Problem statement](#problem-statement)
3. [Architecture](#architecture)
4. [Upload flow](#upload-flow)
5. [Queue & worker flow](#queue--worker-flow)
6. [Database schema](#database-schema)
7. [Image analysis](#image-analysis)
8. [OCR](#ocr)
9. [Indian plate validation](#indian-plate-validation)
10. [Duplicate detection](#duplicate-detection)
11. [Screenshot / photo-of-photo / tampering detection](#screenshot--photo-of-photo--tampering-detection)
12. [Evidence Integrity Score](#evidence-integrity-score)
13. [Confidence handling](#confidence-handling)
14. [Recommendation logic](#recommendation-logic)
15. [Failure handling & retry strategy](#failure-handling--retry-strategy)
16. [Idempotency](#idempotency)
17. [Batch processing](#batch-processing)
18. [Logging](#logging)
19. [Security](#security)
20. [API documentation](#api-documentation)
21. [Sample requests & responses](#sample-requests--responses)
22. [Local setup](#local-setup)
23. [Docker setup](#docker-setup)
24. [Environment variables](#environment-variables)
25. [Deployment architecture](#deployment-architecture)
26. [AI usage disclosure](#ai-usage-disclosure)
27. [AI limitations](#ai-limitations)
28. [Trade-offs](#trade-offs)
29. [Scalability](#scalability)
30. [Future improvements](#future-improvements)
31. [Known limitations](#known-limitations)
32. [Testing](#testing)

---

## Project overview

A person or field agent uploads a photograph of a vehicle (and often its
registration plate) as evidence. FieldVerify checks the image for
quality problems, extracts and validates the registration number,
checks for duplicate submissions, and looks for signals that the image
might be a screenshot, a photo of another photo/screen, or edited —
then combines all of this into one explainable integrity score.

## Problem statement

Raw image uploads are not reliable evidence on their own: they can be
blurry, dark, duplicated, screenshotted, or edited. Perfect automated
fraud detection is out of scope and not promised anywhere in this
system — instead, FieldVerify makes the *uncertainty itself* visible
and actionable: every signal is scored, every issue is explained, and
every decision can be justified from the underlying evidence.

## Architecture

```
                     USER
                       |
                       v
                React Frontend (Vite)
                       |
                       | HTTPS
                       v
                Express REST API  ---------------+
                       |                          |
        +--------------+--------------+           |
        |              |              |            |
        v              v              v            |
     MongoDB        Storage         BullMQ          |
      (images,      (local/         Queue           |
     results)        cloud)           |              |
                                      v               |
                                    Redis              |
                                      |                 |
                                      v                  |
                              Background Worker (separate process)
                                      |
             +------------------------+-----------------------+
             |             |            |          |          |
             v             v            v          v          v
           Sharp        OCR         Duplicate  Integrity  Metadata
        (quality)    (Tesseract)    Detection    Checks    (EXIF)
             |             |            |          |          |
             +-------------+------------+----------+----------+
                                      |
                                      v
                          Optional AI Review (disabled by default)
                                      |
                                      v
                              Scoring Engine
                                      |
                                      v
                                MongoDB Results
```

**Key design decision:** the API server (`src/server.js`) and the
background worker (`src/workers/imageWorker.js`) are separate Node
processes that communicate only through MongoDB and the BullMQ/Redis
queue. The upload endpoint never blocks on image analysis — it
persists metadata, enqueues a job, and returns `202 Accepted`
immediately.

## Upload flow

```
Client --POST /api/v1/images--> API
  API validates MIME + decodability with sharp
  API computes SHA-256 + perceptual hash (dHash)
  API saves the file via the storage abstraction
  API creates an `images` document (status = pending)
  API enqueues a BullMQ job { processingId }
  API returns 202 { processingId, status: "pending" }
```

## Queue & worker flow

```
BullMQ queue: "image-processing"   job name: "process-image"

Worker picks up job
  -> status = processing, currentStage tracked per stage
  -> image quality (blur, brightness, contrast, noise, resolution, aspect ratio)
  -> OCR (Tesseract.js) + Indian plate format validation
  -> EXIF metadata extraction
  -> exact duplicate (SHA-256) + near duplicate (dHash/Hamming) check
  -> screenshot / photo-of-photo / tampering heuristics
  -> vehicle evidence baseline heuristic
  -> centralized scoring engine -> issues, scores, recommendation, explanation
  -> optional AI review (only if enabled AND triggered by weak signals)
  -> AnalysisResult document written
  -> status = completed
```

Every stage failure is caught defensively (e.g. OCR failing returns a
low-confidence empty result) except genuinely unrecoverable errors
(e.g. the stored file cannot be read), which bubble up to BullMQ's
retry mechanism.

## Database schema

**`images`** — one document per upload: `processingId`, `originalName`,
`mimeType`, `size`, `filePath`, `storageUrl`, `sha256`, `perceptualHash`,
`width`, `height`, `status` (`pending|processing|completed|failed`),
`currentStage`, `attempts`, `idempotencyKey`, `error`, `batchId`,
`createdAt`, `startedAt`, `completedAt`, `failedAt`.

**`analysis_results`** — one document per completed/attempted analysis:
`processingId`, `quality`, `ocr`, `duplicate`, `metadata`, `screenshot`,
`photoOfPhoto`, `tampering`, `vehicle`, `aiReview`, `scores`, `issues`,
`recommendation`, `riskLevel`, `explanation`, `timeline`, `metrics`.

Indexes: `processingId` (unique, both collections), `sha256`,
`perceptualHash`, `idempotencyKey` (sparse), `batchId` (sparse),
`status`, and a compound `{ sha256: 1, createdAt: -1 }` index for
duplicate lookups.

## Image analysis

All checks are local and deterministic (no external AI required):

| Check | Method |
|---|---|
| Resolution | Minimum width/height gate (configurable) |
| Aspect ratio | Flags ratios outside a configurable normal range |
| Blur | Laplacian edge-variance (low variance = blurry) |
| Brightness | Mean grayscale luminance → `LOW_LIGHT` / `NORMAL` / `OVEREXPOSED` |
| Contrast | Standard deviation of pixel intensities |
| Noise | High-frequency energy vs. a blurred copy of the same image |

Every measurement returns its raw score, the threshold it was compared
against, and a bounded confidence value — never a bare true/false.

## OCR

[Tesseract.js](https://github.com/naptha/tesseract.js) extracts raw
text and a confidence score. The text is normalized (uppercase, no
whitespace) per OCR line, then scanned for plate-shaped substrings.
OCR failures return an empty, low-confidence result instead of
crashing the pipeline.

## Indian plate validation

The validator checks a configurable regex
(`^[A-Z]{2}[0-9]{1,2}[A-Z]{1,3}[0-9]{1,4}$` by default) against
OCR-derived candidates.

> **The vehicle number validator checks format patterns only and does
> not verify the registration against government records.**

## Duplicate detection

- **Exact**: SHA-256 of the raw file bytes. Any second upload of an
  identical file is flagged `type: "exact"` with the original
  `processingId`.
- **Near**: a 64-bit perceptual difference hash (dHash) compared via
  Hamming distance against recent uploads (configurable threshold,
  default ≤10 bits). This survives resizing and recompression, which
  exact hashing cannot.

## Screenshot / photo-of-photo / tampering detection

All three are explicitly labelled **heuristics**, never presented as
proof:

- **Screenshot**: common device/monitor aspect ratios + UI-like OCR
  text (e.g. "wifi", "battery", "%") + missing camera EXIF.
- **Photo-of-photo**: flattened contrast + unusual noise pattern +
  missing/inconsistent camera metadata.
- **Tampering**: editing-software strings in EXIF (Photoshop, GIMP,
  etc.), stripped metadata, unusually smooth/denoised images.

Output always uses "possible" / "signal" language and a confidence
score, never "definitely" or "fraud".

## Evidence Integrity Score

Five weighted dimensions (weights configurable in
`services/analysis/scoring.js`):

| Dimension | Weight |
|---|---|
| Image quality | 25% |
| OCR | 20% |
| Uniqueness | 20% |
| Authenticity | 20% |
| Vehicle evidence | 15% |

> This score is an **engineering risk/integrity score**, not a
> statistically calibrated probability of fraud.

## Confidence handling

Every check returns its own confidence value alongside its result.
Confidence is a bounded, deterministic function of "how far past the
threshold" a measurement is — it is explicitly an engineering
heuristic, not a trained/calibrated model output, and is documented as
such everywhere it's surfaced.

## Recommendation logic

```
overall >= ACCEPT_THRESHOLD (default 85)  -> ACCEPT / LOW risk
overall >= REVIEW_THRESHOLD (default 60)  -> REVIEW / MEDIUM risk
overall <  REVIEW_THRESHOLD               -> REJECT / HIGH risk
```

Both thresholds are environment variables.

## Failure handling & retry strategy

BullMQ retries failed jobs up to `JOB_ATTEMPTS` (default 3) with
exponential backoff (`JOB_BACKOFF_MS`, default 2000ms base). On final
failure the image is marked `status: "failed"` with a stored error
message and stage. `POST /images/:id/retry` moves a failed job back to
`pending` and re-enqueues it — it is rejected with `400` for any image
not currently in the `failed` state.

## Idempotency

An `Idempotency-Key` header on `POST /images` is checked against
existing records before any new processing ID, storage write, or queue
job is created. A repeated key returns the original `processingId`
with `message: "Idempotent request: returning existing processing ID"`.

## Batch processing

`POST /images/batch` accepts up to `MAX_BATCH_SIZE` (default 10)
images under the `images` field, each getting an independent
`processingId`, job, and result, grouped only by a shared `batchId` for
display purposes.

## Logging

Structured JSON logging via Pino. Every log line for a job carries
`processingId`; request logs carry a request ID. Secrets (passwords,
tokens, API keys) are redacted by the logger's redaction rules and are
never logged even during error handling.

## Security

Helmet, CORS, `express-rate-limit`, Multer file-size/MIME
enforcement, `sharp`-based real image-decodability validation (not
just trusting the MIME header), size-limited JSON body parsing, and no
secrets in source — everything sensitive lives in `.env` (see
`.env.example`, which is safe to commit).

## API documentation

Full Swagger/OpenAPI UI is served at **`/api-docs`** once the API is
running. Endpoints:

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/images` | Upload a single image |
| POST | `/api/v1/images/batch` | Upload up to 10 images |
| GET | `/api/v1/images/:id/status` | Processing status |
| GET | `/api/v1/images/:id/results` | Full structured results |
| GET | `/api/v1/images/:id/error` | Failure details |
| GET | `/api/v1/images/:id/timeline` | Stage-by-stage timeline |
| GET | `/api/v1/images/:id/metrics` | Timing metrics |
| POST | `/api/v1/images/:id/retry` | Retry a failed job |
| GET | `/health` | Health check |

## Sample requests & responses

**Upload**
```bash
curl -X POST http://localhost:4000/api/v1/images \
  -F "image=@vehicle.jpg"
```
```json
{
  "processingId": "fv_8A92K1D3",
  "status": "pending",
  "message": "Image accepted for asynchronous processing"
}
```

**Results (completed)**
```json
{
  "processingId": "fv_8A92K1D3",
  "status": "completed",
  "scores": {
    "imageQuality": 92, "ocr": 88, "uniqueness": 98,
    "authenticity": 87, "vehicleEvidence": 90, "overall": 91
  },
  "recommendation": "ACCEPT",
  "riskLevel": "LOW",
  "explanation": "Image quality is within the configured thresholds. OCR confidence is high. No duplicate was found. No strong screenshot, photo-of-photo, or editing signals were detected. Overall recommendation: ACCEPT."
}
```

## Local setup

```bash
# 1. Infrastructure
docker compose up -d          # MongoDB + Redis

# 2. Backend
cd backend
cp .env.example .env
npm install
npm run dev                    # API on :4000
npm run worker:dev             # in a second terminal

# 3. Frontend
cd ../frontend
npm install
npm run dev                    # UI on :5173 (proxies /api to :4000)
```

## Docker setup

`docker-compose.yml` provisions MongoDB and Redis only (the API and
worker are run with `npm run dev` / `npm run worker` locally against
them, matching the assignment's "make it work locally first"
requirement). `backend/Dockerfile` builds a production image usable
for both the API and worker processes (see `render.yaml`).

## Environment variables

See [`backend/.env.example`](./backend/.env.example) — every threshold,
weight, and limit used anywhere in the analysis or scoring pipeline is
configurable there, not hardcoded.

## Deployment architecture

```
Vercel (frontend) -> Render API (web service) -> MongoDB Atlas
                                               -> Render Redis
                       Render Worker (background worker) --^
Images -> Cloudinary / S3-compatible storage (STORAGE_PROVIDER=cloud)
```

`render.yaml` documents this topology. **The project has not been
deployed** — per the assignment, local end-to-end verification comes
first (see [Known limitations](#known-limitations) for why the full
local DB round-trip could not be executed inside this particular
sandboxed build environment, and what running `docker compose up -d`
on a normal machine will additionally verify).

## AI usage disclosure

AI (Claude) was used throughout building this project for:

- architecture brainstorming and reconciling the assignment's 74
  sections into one coherent, modular structure
- writing implementation code across the backend, frontend, and tests
- debugging — for example, the initial OCR-candidate extraction
  function collapsed newlines before tokenizing, which merged
  unrelated OCR lines together and silently broke plate detection on
  any multi-line receipt-style text; a unit test caught this and the
  fix (normalize per-line, not per-blob) is in
  `services/analysis/plateValidator.js`
- generating and running the Jest test suite
- writing this documentation

AI-generated suggestions were treated as drafts: every file was
written, then syntax-checked, then exercised by real tests where
possible (31 tests actually executed and passing, not merely written).
Where full execution wasn't possible in this environment (see below),
that is stated explicitly rather than assumed to work. No test result
in this document was fabricated.

## AI limitations

The optional AI review step (`services/analysis/aiReview.js`) is
disabled by default (`AI_REVIEW_ENABLED=false`) and has no live
provider wired in — it defines the `AIProvider` interface and the
trigger logic (low deterministic confidence, low OCR confidence,
suspicious signals, or overall score below a threshold) but throws
inside a caught, logged path if ever enabled without a real
implementation, which never fails the surrounding job. This satisfies
the mandatory requirement that the **core system works without any
external AI API** — nothing in the required pipeline depends on it.

## Trade-offs

- Deterministic heuristics instead of a trained ML model for
  screenshot/photo-of-photo/tampering/vehicle detection — faster to
  build, fully explainable, but weaker than a trained classifier.
- HTTP polling for status instead of WebSockets — simpler, sufficient
  for this scale.
- Local filesystem storage for development; cloud storage is an
  interface-compatible placeholder, not wired to a live provider.
- Perceptual hashing (dHash) instead of a vector-similarity index for
  near-duplicates — adequate at take-home scale, scans recent
  candidates rather than the full collection.
- MongoDB instead of a distributed database — simplicity over scale.
- A heuristic "vehicle evidence" baseline instead of a trained object
  detector, clearly labelled `method: "heuristic_baseline"` everywhere
  it appears.

## Scalability

Current: one API instance, one worker process, one Redis, one
MongoDB. BullMQ's `Worker` concurrency (currently 2) can be raised, and
multiple worker *processes* can run against the same queue/Redis
without any code change — jobs are distributed automatically. Further
scaling levers: MongoDB indexes (already in place on the hot query
paths), rate limiting (already in place), horizontal worker scaling on
Render, and swapping local storage for object storage so workers don't
need shared disk.

## Future improvements

- A dedicated trained vehicle/plate detector
- Calibrated (not heuristic) confidence models
- Real object storage (S3/Cloudinary) wiring
- Antivirus scanning of uploads
- Signed URLs for image access
- Authentication/authorization
- Distributed tracing and alerting
- An ML-based screenshot/tampering classifier

## Known limitations

- **This build environment could not run a real MongoDB instance**
  (no `mongod` package available via `apt`, no Docker, and outbound
  network access is restricted to package registries — MongoDB's
  binary/image servers are not reachable). Redis *was* installed and
  run locally. As a direct result:
  - All **31 tests that don't require a live database** were actually
    executed here and pass (pure-logic unit tests for blur, brightness,
    hashing, plate validation, screenshot heuristics, and the scoring
    engine, plus API validation tests against the real Express app).
  - The upload→queue→worker→DB round trip, idempotency, batch, retry,
    and full worker-pipeline tests are **written and verified to fail
    safely / auto-skip** when MongoDB is unreachable, but were not
    executed end-to-end against a live database in this sandbox. Run
    `docker compose up -d` followed by `npm test` on a normal machine
    (with Docker) to execute all 42 tests, including these 11.
  - The frontend was built and compiles cleanly with Vite
    (`npm run build` succeeds, 1578 modules transformed) but was not
    visually verified in a browser against a fully running backend,
    for the same reason.
- The vehicle-evidence detector is a heuristic baseline, not a trained
  detector — see Trade-offs.
- OCR accuracy on low-quality or angled plate photos will be limited;
  this is inherent to general-purpose OCR without a plate-specific
  model.

## Testing

```bash
cd backend
npm test                 # runs everything; DB-dependent suites
                          # auto-skip if MongoDB is unreachable
```

Test layout:
- `tests/unit/` — pure logic, no infrastructure required (25 tests)
- `tests/api/validation.test.js` — Express app validation paths, no DB
  required (6 tests)
- `tests/api/images.integration.test.js` — full upload/idempotency/
  batch/retry round trip, requires MongoDB (auto-skips otherwise)
- `tests/worker/worker.test.js` — full pipeline execution via
  `processImage`, requires MongoDB (auto-skips otherwise)

Last executed result in this environment:
```
Test Suites: 2 skipped, 7 passed, 7 of 9 total
Tests:       11 skipped, 42 passed, 53 total
```

## OCR / registration handling update

Registration extraction uses broad OCR plus targeted lower-vehicle OCR crops with small deskew rotations. Candidates are reconstructed across complementary OCR passes so a plate whose characters are split across passes can still be recovered. A single noisy text match from advertisements, phone numbers, task IDs, or unrelated scene text is not allowed to outrank a plate-focused candidate. Registration validation remains structural only and does not claim government/RTO verification.

## Production deployment: Vercel + Render (simple demo topology)

The project is deployment-ready without a paid AI API or a separate cloud image service.

### Architecture

```text
Vercel (React/Vite)
        |
        | HTTPS API requests
        v
Render Web Service
  ├── Express API
  └── BullMQ Worker (embedded in same process for the demo)
        |
        +---- Render Key Value (Redis-compatible queue)
        |
        +---- MongoDB Atlas
                ├── metadata
                └── GridFS image storage
```

The queue is still asynchronous: the upload request creates the MongoDB record, enqueues a BullMQ job, and returns a processing ID immediately. The worker processes the job after the HTTP request has returned. Running the worker in the same Render service is a deployment simplification for this take-home; at larger scale it can be moved to the separate background-worker service already supported by the Docker image.

### 1. Push the repository

Push the extracted project to GitHub. Keep `.env` out of Git.

### 2. Create MongoDB Atlas

Create a MongoDB database and copy its connection string. Allow the Render service to connect (for a short take-home demo, the Atlas network access rule can allow `0.0.0.0/0`; use a restricted network policy for production).

The production build uses MongoDB GridFS for uploaded images, so the API and worker do not depend on a shared Render filesystem.

### 3. Deploy the backend to Render

The repository already contains `render.yaml`.

In Render, create a new Blueprint from the repository and let it create:

- `fieldverify-api` web service
- `fieldverify-queue` Key Value service

Set this secret in the Render web service:

```text
MONGODB_URI=<your MongoDB Atlas connection string>
```

The Blueprint wires `REDIS_URL` automatically from the Render Key Value service.

The backend Dockerfile exposes port 4000 locally. Render injects its runtime `PORT`; the Blueprint sets the service to `10000` for the production demo.

After deployment, verify:

```text
https://YOUR-RENDER-SERVICE.onrender.com/health
```

It should return JSON with `status: ok`.

### 4. Deploy the frontend to Vercel

Create a new Vercel project from the same repository and set the **Root Directory** to:

```text
frontend
```

Build command:

```text
npm run build
```

Output directory:

```text
dist
```

Add this environment variable in Vercel:

```text
VITE_API_BASE_URL=https://YOUR-RENDER-SERVICE.onrender.com/api/v1
```

Redeploy the frontend after adding the variable.

### 5. Verify the complete deployed flow

Open the Vercel URL and upload one vehicle image.

The flow should be:

```text
Browser
  -> Vercel frontend
  -> Render POST /api/v1/images
  -> MongoDB record created
  -> BullMQ job added to Render Key Value
  -> embedded worker picks job
  -> image downloaded from MongoDB GridFS
  -> quality/OCR/duplicate/integrity analysis
  -> result saved to MongoDB
  -> frontend polls status
  -> frontend displays ACCEPT / REVIEW / REJECT + reasons
```

### Why MongoDB GridFS is used in deployment

Render services have an ephemeral filesystem by default, so local `uploads/` storage should not be used for production deployment. The deployed build therefore uses MongoDB GridFS when `STORAGE_PROVIDER=mongodb`. This keeps the uploaded image accessible to both the API and worker process without adding Cloudinary/S3 to the take-home.

### Optional production scaling

If the application needs to scale beyond a single demo instance, run the same Docker image as a Render background worker with:

```text
node src/workers/imageWorker.js
```

and set `RUN_WORKER_IN_API=false` on the web service. Both services should share the same MongoDB and Redis/Key Value configuration.

### OCR performance

The OCR pipeline intentionally uses a bounded number of image passes. Earlier development versions could generate dozens of Tesseract recognitions per image, which made local verification appear to hang. The current implementation uses a small set of context crops plus the strongest plate-region proposals and can stop early when two focused passes agree on a structurally valid registration. This keeps OCR asynchronous without making the demo unnecessarily slow.
