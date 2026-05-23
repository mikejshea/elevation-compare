package gpx

import (
	"fmt"
	"math"
	"strings"
	"testing"
)

// gpxDoc builds a minimal GPX document from a track name and a slice of points.
// An empty trackName omits the <name> element, exercising the "Unnamed Route" fallback.
func gpxDoc(trackName string, points []struct{ lat, lon, ele float64 }) []byte {
	var b strings.Builder
	b.WriteString(`<?xml version="1.0"?><gpx version="1.1"><trk>`)
	if trackName != "" {
		fmt.Fprintf(&b, "<name>%s</name>", trackName)
	}
	b.WriteString("<trkseg>")
	for _, p := range points {
		fmt.Fprintf(&b, `<trkpt lat="%f" lon="%f"><ele>%f</ele></trkpt>`, p.lat, p.lon, p.ele)
	}
	b.WriteString("</trkseg></trk></gpx>")
	return []byte(b.String())
}

// ── Elevation normalization ───────────────────────────────────────────────

func TestElevationNormalization(t *testing.T) {
	// min = 80 m; each point should be shifted down by 80
	pts := []struct{ lat, lon, ele float64 }{
		{0, 0.000, 100}, // 100 - 80 = 20.0
		{0, 0.001, 150}, // 150 - 80 = 70.0
		{0, 0.002, 80},  //  80 - 80 =  0.0
	}
	route, err := Parse(gpxDoc("Test", pts))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(route.Points) != 3 {
		t.Fatalf("got %d points, want 3", len(route.Points))
	}

	want := []float64{20.0, 70.0, 0.0}
	for i, p := range route.Points {
		if p.Elevation != want[i] {
			t.Errorf("point[%d].Elevation = %.1f, want %.1f", i, p.Elevation, want[i])
		}
	}
}

func TestElevationNormalizationAllSame(t *testing.T) {
	// When all points share the same elevation every normalized value is 0.
	pts := []struct{ lat, lon, ele float64 }{
		{0, 0, 500},
		{0, 0.01, 500},
		{0, 0.02, 500},
	}
	route, err := Parse(gpxDoc("Flat", pts))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	for i, p := range route.Points {
		if p.Elevation != 0 {
			t.Errorf("point[%d].Elevation = %.1f, want 0.0", i, p.Elevation)
		}
	}
}

// ── Distance calculation ──────────────────────────────────────────────────

func TestFirstPointDistanceIsZero(t *testing.T) {
	pts := []struct{ lat, lon, ele float64 }{
		{48.8566, 2.3522, 35},
		{48.8606, 2.3376, 40},
	}
	route, err := Parse(gpxDoc("Paris", pts))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if route.Points[0].Distance != 0 {
		t.Errorf("first point distance = %f, want 0", route.Points[0].Distance)
	}
}

func TestCumulativeDistance(t *testing.T) {
	// Two points 1 degree of latitude apart at the equator ≈ 111.195 km.
	pts := []struct{ lat, lon, ele float64 }{
		{0, 0, 0},
		{1, 0, 0},
	}
	route, err := Parse(gpxDoc("Equator", pts))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	got := route.Points[1].Distance
	const wantKm, tol = 111.195, 0.1
	if math.Abs(got-wantKm) > tol {
		t.Errorf("distance = %.3f km, want %.3f km (±%.1f)", got, wantKm, tol)
	}
}

// ── Track name ────────────────────────────────────────────────────────────

func TestTrackName(t *testing.T) {
	pts := []struct{ lat, lon, ele float64 }{{0, 0, 0}}

	t.Run("named track uses track name", func(t *testing.T) {
		route, err := Parse(gpxDoc("Morning Ride", pts))
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if route.Name != "Morning Ride" {
			t.Errorf("Name = %q, want %q", route.Name, "Morning Ride")
		}
	})

	t.Run("missing name falls back to Unnamed Route", func(t *testing.T) {
		route, err := Parse(gpxDoc("", pts))
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if route.Name != "Unnamed Route" {
			t.Errorf("Name = %q, want %q", route.Name, "Unnamed Route")
		}
	})
}

// ── Response metadata ─────────────────────────────────────────────────────

func TestResponseUnits(t *testing.T) {
	pts := []struct{ lat, lon, ele float64 }{{0, 0, 0}}
	route, err := Parse(gpxDoc("Test", pts))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if route.DistanceUnit != "km" {
		t.Errorf("DistanceUnit = %q, want %q", route.DistanceUnit, "km")
	}
	if route.ElevationUnit != "m" {
		t.Errorf("ElevationUnit = %q, want %q", route.ElevationUnit, "m")
	}
}

// ── Error cases ───────────────────────────────────────────────────────────

func TestParseErrors(t *testing.T) {
	t.Run("invalid XML", func(t *testing.T) {
		_, err := Parse([]byte("not xml at all {{{{"))
		if err == nil {
			t.Error("expected error for invalid XML, got nil")
		}
	})

	t.Run("no tracks", func(t *testing.T) {
		_, err := Parse([]byte(`<?xml version="1.0"?><gpx version="1.1"></gpx>`))
		if err == nil {
			t.Error("expected error for GPX with no tracks, got nil")
		}
	})

	t.Run("no elevation data", func(t *testing.T) {
		gpx := []byte(`<?xml version="1.0"?><gpx version="1.1"><trk><name>T</name>` +
			`<trkseg><trkpt lat="0" lon="0"/></trkseg></trk></gpx>`)
		_, err := Parse(gpx)
		if err == nil {
			t.Error("expected error for GPX with no elevation data, got nil")
		}
	})
}

// ── Haversine ─────────────────────────────────────────────────────────────

func TestHaversineKm(t *testing.T) {
	tests := []struct {
		name              string
		lat1, lon1        float64
		lat2, lon2        float64
		wantKm, tolerKm   float64
	}{
		{
			name:    "same point",
			lat1: 0, lon1: 0, lat2: 0, lon2: 0,
			wantKm: 0, tolerKm: 0,
		},
		{
			// 1° latitude at the equator = 2π×6371/360 ≈ 111.195 km
			name:    "1 degree latitude at equator",
			lat1: 0, lon1: 0, lat2: 1, lon2: 0,
			wantKm: 111.195, tolerKm: 0.1,
		},
		{
			// 1° longitude at the equator is the same length as 1° latitude
			name:    "1 degree longitude at equator",
			lat1: 0, lon1: 0, lat2: 0, lon2: 1,
			wantKm: 111.195, tolerKm: 0.1,
		},
		{
			// Half the equatorial circumference = π × R ≈ 20,015 km
			name:    "half circumference along equator",
			lat1: 0, lon1: 0, lat2: 0, lon2: 180,
			wantKm: math.Pi * 6371.0, tolerKm: 1.0,
		},
		{
			// Symmetry: swapping start and end should give the same distance
			name:    "symmetry",
			lat1: 48.8566, lon1: 2.3522, lat2: 51.5074, lon2: -0.1278,
			wantKm: haversineKm(51.5074, -0.1278, 48.8566, 2.3522), tolerKm: 0,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := haversineKm(tc.lat1, tc.lon1, tc.lat2, tc.lon2)
			if math.Abs(got-tc.wantKm) > tc.tolerKm {
				t.Errorf("haversineKm(%.4f,%.4f → %.4f,%.4f) = %.3f km, want %.3f km (±%.3f)",
					tc.lat1, tc.lon1, tc.lat2, tc.lon2, got, tc.wantKm, tc.tolerKm)
			}
		})
	}
}
