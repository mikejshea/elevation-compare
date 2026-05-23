package gpx

import (
	"encoding/xml"
	"fmt"
	"math"
)

type gpxFile struct {
	XMLName xml.Name   `xml:"gpx"`
	Tracks  []gpxTrack `xml:"trk"`
}

type gpxTrack struct {
	Name     string       `xml:"name"`
	Segments []gpxSegment `xml:"trkseg"`
}

type gpxSegment struct {
	Points []gpxPoint `xml:"trkpt"`
}

type gpxPoint struct {
	Lat  float64      `xml:"lat,attr"`
	Lon  float64      `xml:"lon,attr"`
	Ele  *float64     `xml:"ele"`
}

type Point struct {
	Distance  float64 `json:"distance"`
	Elevation float64 `json:"elevation"`
	Lat       float64 `json:"lat"`
	Lon       float64 `json:"lon"`
}

type RouteData struct {
	Name          string  `json:"name"`
	DistanceUnit  string  `json:"distance_unit"`
	ElevationUnit string  `json:"elevation_unit"`
	Points        []Point `json:"points"`
}

func Parse(data []byte) (*RouteData, error) {
	var gpx gpxFile
	if err := xml.Unmarshal(data, &gpx); err != nil {
		return nil, fmt.Errorf("parsing gpx xml: %w", err)
	}

	if len(gpx.Tracks) == 0 {
		return nil, fmt.Errorf("gpx file contains no tracks")
	}

	name := gpx.Tracks[0].Name
	if name == "" {
		name = "Unnamed Route"
	}

	// Collect all raw points across all tracks and segments.
	type rawPoint struct {
		lat, lon, ele float64
	}
	var raw []rawPoint

	for _, trk := range gpx.Tracks {
		for _, seg := range trk.Segments {
			for _, pt := range seg.Points {
				if pt.Ele == nil {
					// Skip points with no elevation data rather than crashing.
					continue
				}
				raw = append(raw, rawPoint{pt.Lat, pt.Lon, *pt.Ele})
			}
		}
	}

	if len(raw) == 0 {
		return nil, fmt.Errorf("gpx file contains no points with elevation data")
	}

	// Find minimum elevation for normalization.
	minEle := raw[0].ele
	for _, p := range raw[1:] {
		if p.ele < minEle {
			minEle = p.ele
		}
	}

	points := make([]Point, len(raw))
	var cumDist float64
	for i, p := range raw {
		if i > 0 {
			cumDist += haversineKm(raw[i-1].lat, raw[i-1].lon, p.lat, p.lon)
		}
		points[i] = Point{
			Distance:  math.Round(cumDist*1000) / 1000,
			Elevation: math.Round((p.ele-minEle)*10) / 10,
			Lat:       p.lat,
			Lon:       p.lon,
		}
	}

	return &RouteData{
		Name:          name,
		DistanceUnit:  "km",
		ElevationUnit: "m",
		Points:        points,
	}, nil
}

// haversineKm returns the great-circle distance in kilometers between two lat/lon points.
func haversineKm(lat1, lon1, lat2, lon2 float64) float64 {
	const earthRadiusKm = 6371.0
	dLat := toRad(lat2 - lat1)
	dLon := toRad(lon2 - lon1)
	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(toRad(lat1))*math.Cos(toRad(lat2))*
			math.Sin(dLon/2)*math.Sin(dLon/2)
	return earthRadiusKm * 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
}

func toRad(deg float64) float64 {
	return deg * math.Pi / 180
}
