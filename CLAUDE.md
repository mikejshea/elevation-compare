# Elevation Compare — Project Specification

## Overview
A single-page web application that allows users to upload `.gpx` files from Strava or Garmin and visually compare elevation profiles across multiple routes on a single overlaid graph. No backend storage, no authentication, no database.

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
- **Cloud Run**: containerized Go app (serverless, pay-per-request)
- **Cloud Storage + Cloud CDN** (optional): serve static assets if needed
- Target: essentially $0/month for low-traffic usage
- Docker container: small Alpine-based Go image

### IaC: Terraform
- Provision: Cloud Run service, Artifact Registry (Docker images), IAM, Cloud Build trigger (optional)
- Store Terraform state in a GCS bucket
- Separate `environments/` for staging and production if needed

### CI/CD: GitHub Actions
- On push to `main`: build Docker image, push to Artifact Registry, deploy to Cloud Run
- Terraform apply in pipeline (or manual for infra changes)

---

## Project Structure

```
elevation_compare/
├── CLAUDE.md                  # This file
├── README.md
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

## Out of Scope (v1)
- User accounts or authentication
- Persistent storage of routes across sessions
- Route editing or annotation
- Map view of the route
- Social sharing

---

## GCP Setup Notes
- Project will be created fresh; no existing GCP account
- Billing must be enabled but costs should stay in free tier
- Use `us-central1` as default region
- Service account for GitHub Actions: minimal permissions (Cloud Run Admin, Artifact Registry Writer)