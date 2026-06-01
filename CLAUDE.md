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
| 7 | Route X-axis offset slider | Complete |
| 8 | Route map thumbnail — SVG polyline from lat/lon in sidebar | Complete |
| 9 | Description panel — full-width informational section below chart | Complete |
| 10 | PNG export — download button renders header + sidebar + chart to a 1600×900 canvas | Complete |
| 11 | Route Y-axis offset slider | Complete |

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
- X-axis: distance (km or miles, with a toggle) — **default: miles**
- Y-axis: normalized elevation (meters or feet, with a toggle) — **default: feet**
- Each route gets a distinct color with a legend
- Built-in Chart.js tooltip is disabled (`plugins.tooltip.enabled: false`)
- Hover interaction: custom inline Chart.js plugin draws a vertical crosshair line at the cursor position and displays the distance value in a label just below the x-axis; implemented via `afterEvent` / `afterDraw` plugin hooks using `scales.x.getValueForPixel()` for label interpolation
- Smooth, professional styling consistent with light/dark mode

### Description Panel

A fixed-height strip pinned to the bottom of the viewport, always visible without scrolling. The page layout is a strict three-row column: header → middle section (sidebar + chart, `flex: 1`) → description panel (`flex-shrink: 0`). The chart area shrinks to accommodate the panel; all three rows fit within the viewport height with no page-level scroll.

Three equal columns spanning the full panel width (no max-width constraint) on desktop; hidden entirely on mobile (≤640px) to preserve chart space:

- **What is this?** — brief product description
- **How to use it** — ordered steps: upload GPX, check/uncheck routes, use offset slider
- **About elevation normalization** — explains why routes starting at different altitudes can still be compared (minimum elevation subtracted from all points so every route's lowest point is 0)

A collapse toggle button (chevron) in the panel header hides the grid, leaving just a thin label strip. Collapsed state persists in `localStorage` across page loads. Chevron animates 180° on collapse/expand.

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
    { "distance": 0.0, "elevation": 0.0, "lat": 37.7749, "lon": -122.4194 },
    { "distance": 0.12, "elevation": 4.3, "lat": 37.7751, "lon": -122.4180 },
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

## Changelog
### v5 (current)
- Route Y-axis offset slider — per-route "V-Offset" slider shifts the elevation profile up or down; range is ±max elevation across loaded routes; updates when elevation unit is toggled; allows comparing climbs at different vertical positions

### v4
- PNG export button in the header downloads a 1600×900 landscape canvas image containing the header bar, sidebar route list, and chart — excludes the description panel; uses `chart.toBase64Image()` for the chart portion and Canvas 2D API for the header and sidebar; respects current light/dark theme

### v3
- Default units changed to miles and feet (was km and meters)
- Built-in Chart.js tooltip disabled; replaced with a custom crosshair plugin that draws a vertical line and distance label below the x-axis on hover (`afterEvent` / `afterDraw` hooks, `scales.x.getValueForPixel()`)
- Description panel added below the chart

### v2
- Route X-axis offset slider — per-route slider shifts the dataset along the X axis to align segments of different-length routes
- Route map thumbnail — SVG polyline rendered from lat/lon in the sidebar for each route; no external map API

### v1
- Initial release: GPX upload, elevation normalization, multi-route overlay chart, light/dark mode, Cloud Run deployment

---

## V2 Backlog

Features deferred from v1, in no particular priority order:

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
