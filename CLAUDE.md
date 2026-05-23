# Elevation Compare — Project Specification

## Overview
A single-page web application that allows users to upload `.gpx` files from Strava or Garmin and visually compare elevation profiles across multiple routes on a single overlaid graph. No backend storage, no authentication, no database.

**Live URL:** https://elevation-compare-elnvvp4iaq-uc.a.run.app
**GitHub:** https://github.com/mikejshea/elevation-compare

---

## v1 Status — All Phases Complete

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Backend — Go HTTP server, GPX parser, unit tests | Complete |
| 2 | Frontend — HTML/CSS/JS, Chart.js graph, light/dark mode | Complete |
| 3 | Docker — two-stage Alpine build, verified locally | Complete |
| 4 | Terraform — Cloud Run, Artifact Registry, WIF, GCS state | Complete |
| 5 | GitHub Actions — CI/CD pipeline with Workload Identity Federation | Complete |
| 6 | Live deployment — Cloud Run deployed and verified | Complete |

---

## Core Functionality

### GPX Upload & Processing
- Users can upload one or more `.gpx` files via the UI
- Each file is processed server-side (Go)
- Processing extracts GPS trackpoints: latitude, longitude, elevation, and cumulative distance
- **Elevation normalization**: find the minimum elevation in the route and subtract it from all points, setting the lowest point to 0 ft. This allows routes starting at different sea-level elevations to be visually compared on the same graph
- Return processed data as JSON to the frontend: `{ name, points: [{distance_km, elevation_m}] }`

### Left Panel — Route List
- Displays all routes uploaded in the current browser session
- Each route shows as a list item with a checkbox and filename/route name
- On upload, route is automatically checked and displayed
- Unchecking a route removes it from the graph
- Checking it again adds it back
- Routes persist in memory for the session only (no backend storage)

### Main Panel — Elevation Graph
- Overlaid multi-line chart: one line per checked route
- X-axis: distance (km or miles, with a toggle)
- Y-axis: normalized elevation (meters or feet, with a toggle)
- Each route gets a distinct color with a legend
- Graph is interactive: hover tooltips showing distance and elevation at cursor
- Smooth, professional styling consistent with light/dark mode

### Light / Dark Mode
- Toggle button in the header
- Respects system preference on first load (`prefers-color-scheme`)
- Persists user choice in `localStorage`
- All UI components — sidebar, graph, buttons — must adapt cleanly

---

## Tech Stack

### Backend: Go
- Single Go binary serving:
  - Static frontend files (HTML/CSS/JS)
  - `POST /upload` endpoint: accepts `.gpx` file, returns processed JSON
- Use standard library where possible; `encoding/xml` for GPX parsing
- Minimal dependencies

### Frontend: Vanilla HTML + CSS + JavaScript
- No build step, no framework
- Chart library: **Chart.js** (loaded via CDN)
- Clean, professional UI using CSS custom properties for theming
- Mobile-responsive layout (sidebar collapses on small screens)

### Infrastructure: Google Cloud Platform
- **Cloud Run**: containerized Go app (serverless, scales to zero)
- GCP project: `elevation-compare`, region: `us-central1`
- Docker container: two-stage Alpine-based Go image (golang:1.22-alpine → alpine:3.20)
- Runtime: 1 CPU / 512Mi memory, CPU allocated during requests only (`cpu_idle = true`)

### IaC: Terraform
- Provisions: Cloud Run service, Artifact Registry, IAM, Workload Identity Federation
- Remote state stored in GCS bucket `elevation-compare-tfstate`
- `github_repo` variable defaults to `mikejshea/elevation-compare`

### CI/CD: GitHub Actions
- Trigger: push to `main`
- Auth: **Workload Identity Federation** — no long-lived service account keys stored in GitHub
- Steps: build Docker image → push to Artifact Registry → deploy to Cloud Run
- Image tagged with `github.sha` for traceability
- GitHub secrets required: `WIF_PROVIDER`, `WIF_SERVICE_ACCOUNT` (values from `terraform output`)

---

## Project Structure

```
elevation_compare/
├── CLAUDE.md                  # This file
├── README.md
├── .gitignore
├── .github/
│   └── workflows/
│       └── deploy.yml         # GitHub Actions CI/CD
├── backend/
│   ├── main.go                # HTTP server + routes
│   ├── gpx/
│   │   ├── parser.go          # GPX parsing + elevation normalization
│   │   └── parser_test.go     # Unit tests for parser and haversine
│   ├── Dockerfile
│   └── go.mod
├── frontend/
│   ├── index.html
│   ├── style.css
│   └── app.js
└── terraform/
    ├── main.tf
    ├── variables.tf
    ├── outputs.tf
    └── backend.tf             # GCS remote state
```

---

## API Contract

### `POST /upload`
- Content-Type: `multipart/form-data`
- Field: `file` (`.gpx`)
- Response (200):
```json
{
  "name": "Morning Ride",
  "distance_unit": "km",
  "elevation_unit": "m",
  "points": [
    { "distance": 0.0, "elevation": 0.0 },
    { "distance": 0.12, "elevation": 4.3 },
    ...
  ]
}
```
- Response (400): `{ "error": "invalid gpx file" }`

---

## Design Guidelines

- **Typography**: Clean sans-serif (system font stack or Inter via Google Fonts)
- **Colors**: Use CSS custom properties; define a full light and dark palette
- **Sidebar**: Fixed width ~280px, collapsible on mobile
- **Graph**: Takes remaining width, minimum height 400px
- **Buttons**: Rounded, subtle hover states
- **Upload area**: Drag-and-drop zone + click-to-browse
- **Route colors**: Use a predefined palette of 8–10 distinct, accessible colors; cycle through them as routes are added
- **Accessibility**: Semantic HTML, ARIA labels on interactive elements, keyboard navigable

---

## Coding Conventions

- Go: standard `gofmt` formatting, error wrapping with `fmt.Errorf("...: %w", err)`
- JavaScript: ES6+, no TypeScript, no bundler
- CSS: BEM-ish naming, CSS custom properties for all colors and spacing
- Terraform: consistent naming `elevation-compare-{resource}`
- Git: conventional commits (`feat:`, `fix:`, `infra:`, `docs:`)

---

## Testing

### Approach
Go standard library only — no third-party test frameworks. Tests live alongside the code they test (`parser_test.go` next to `parser.go`).

Tests use `package gpx` (not `package gpx_test`) so unexported functions like `haversineKm` can be tested directly without exporting them.

The `gpxDoc` helper in `parser_test.go` builds minimal GPX XML from a track name and a slice of `{lat, lon, ele}` points, keeping test cases compact and readable.

### What is tested (`backend/gpx/parser_test.go`)
- **Elevation normalization**: minimum elevation is subtracted from all points so the lowest point becomes 0; verified with a 3-point case and with all-same elevation
- **Cumulative distance**: first point is always 0; second point 1° latitude apart at the equator matches the expected ~111.195 km
- **Haversine accuracy**: same point → 0; 1° lat/lon at equator → ~111.195 km (±0.1 km); half-circumference → π × R; symmetry (A→B == B→A)
- **Track name**: named track uses GPX `<name>`; missing name falls back to `"Unnamed Route"`
- **Response metadata**: `distance_unit` is `"km"`, `elevation_unit` is `"m"`
- **Error cases**: invalid XML, no tracks, no elevation data

### Running tests
```bash
# from backend/
go test ./...

# verbose
go test ./... -v
```

---

## Local Development

```bash
# 1. Run the backend (serves frontend from ../frontend)
cd backend
go run .
# Server listens on http://localhost:8080

# 2. Run tests
cd backend
go test ./...

# 3. Build and verify
cd backend
go build ./...
```

No frontend build step — edit HTML/CSS/JS and reload the browser.

### Docker

Build context is the **project root** (not `backend/`) so the image can include both `backend/` and `frontend/`:

```bash
# from project root
docker build -f backend/Dockerfile -t elevation-compare:local .

# run locally
docker run --rm -p 8080:8080 elevation-compare:local
```

The image uses a two-stage build (golang:1.22-alpine → alpine:3.20) and runs as a non-root user. The binary is placed at `/app/backend/server` and static files at `/app/frontend/` so `http.Dir("../frontend")` in `main.go` resolves correctly without any code changes.

---

## GCP Infrastructure Notes

- GCP project `elevation-compare` deployed to `us-central1`
- Terraform state bucket: `gs://elevation-compare-tfstate` (must exist before `terraform init`)
- Cloud Run service account: `elevation-compare-run@elevation-compare.iam.gserviceaccount.com`
- GitHub Actions service account: `github-actions@elevation-compare.iam.gserviceaccount.com`
- WIF pool: `elevation-compare-github`, scoped to `mikejshea/elevation-compare`
- Terraform manages infra; `gcloud run deploy` in GitHub Actions manages image updates (Terraform ignores image changes via `lifecycle.ignore_changes`)

### Re-deploying infra
```bash
cd terraform
terraform init
terraform apply
```

### Manually deploying an image
```bash
gcloud run deploy elevation-compare \
  --image=us-central1-docker.pkg.dev/elevation-compare/elevation-compare/server:TAG \
  --region=us-central1 \
  --project=elevation-compare
```

---

## V2 Backlog

Features deferred from v1, in no particular priority order:

### Route map thumbnail
Draw an SVG polyline thumbnail of each route's GPS path inline in the sidebar below the route name. No external map API — normalize the lat/lon coordinates to fit a small fixed-size SVG box with a neutral background.

Implementation notes:
- Backend: lat/lon points are already parsed by `gpx.Parse` but not currently returned. Add a `points_geo` field (or extend the existing `points` array) to include `lat` and `lon` alongside `distance` and `elevation` in the `/upload` response
- Frontend: after upload, generate an SVG `<polyline>` by mapping lat/lon to SVG viewport coordinates — scale and translate so the bounding box of the route fills the SVG box with a small padding margin
- SVG box: fixed size (e.g. 240×120px), neutral stroke color that adapts to light/dark mode via CSS custom properties, no tiles or external requests

### Route X-axis offset slider
Add a per-route slider in the sidebar that shifts that route's dataset forward along the X axis. For example, sliding a 50-mile route to start at mile 50 allows comparison against the second half of a 100-mile route.

Implementation notes:
- Frontend only — no backend changes needed
- Store an offset value (default 0) per route; when rendering, add the offset to each distance point before passing the dataset to Chart.js
- Slider range: 0 to the total distance of the longest currently-loaded route; update the max dynamically when routes are added or removed
- Display the current offset value next to the slider (e.g. `+12.4 km`)
- Respect the active km/miles unit toggle when displaying and applying the offset

### Other backlog items
- Map view of the route (Leaflet.js or Mapbox)
- Route editing and annotation
- Social sharing / permalink to a comparison set
- Persistent storage of routes across sessions
- User accounts and saved route collections
- Segment highlighting (mark a climb or key section)
- Grade / gradient overlay on the elevation graph
- Export comparison as image or PDF

---
