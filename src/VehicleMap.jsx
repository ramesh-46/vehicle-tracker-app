import React, { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// ------------------ Utility Functions ------------------

function bearingBetween(lat1, lon1, lat2, lon2) {
  const toRad = (d) => d * Math.PI / 180;
  const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
            Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1));
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

// Font Awesome Taxi Icon
const vehicleDivIcon = (size = 50) =>
  L.divIcon({
    className: "vehicle-icon",
    html: `
      <div style="
        width: ${size}px;
        height: ${size}px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: ${size * 0.6}px;
        color: white;
        background: linear-gradient(135deg, #3b82f6, #1d4ed8);
        border-radius: 50%;
        box-shadow: 0 4px 12px rgba(59, 130, 246, 0.5);
        transform: rotate(0deg);
        transition: transform 0.2s ease;
      ">
        <i class="fa-solid fa-taxi"></i>
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });

// Enhanced waypoint icon
const waypointIcon = (type = "default") => {
  const colors = {
    "default": "#10b981",
    "restaurant": "#f59e0b",
    "shopping": "#8b5cf6",
    "landmark": "#ef4444"
  };
  const color = colors[type] || colors.default;
  
  return L.divIcon({
    className: "waypoint-icon",
    html: `<div style="
      width: 30px;
      height: 30px;
      background: ${color};
      border: 3px solid white;
      border-radius: 50%;
      box-shadow: 0 2px 8px rgba(0,0,0,0.4);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
      color: white;
      font-weight: bold;
    ">📍</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
};

function Recenter({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.setView(center, map.getZoom(), { animate: true, duration: 0.8 });
  }, [center, map]);
  return null;
}

// ------------------ Main Component ------------------

export default function VehicleMap() {
  const [waypoints, setWaypoints] = useState([]);
  const [osrmRoute, setOsrmRoute] = useState([]);
  const [animPos, setAnimPos] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speedFactor, setSpeedFactor] = useState(1);
  const [timeline, setTimeline] = useState("today");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [progressPercent, setProgressPercent] = useState(0);
  const [currentSegment, setCurrentSegment] = useState(0);
  const [estimatedSpeed, setEstimatedSpeed] = useState(0);
  const [totalDistance, setTotalDistance] = useState(0); // km
  const [distanceFromLastStop, setDistanceFromLastStop] = useState(0); // km
  const [batteryLevel, setBatteryLevel] = useState(87); // %
  const [todayRunning, setTodayRunning] = useState("00h:00m");
  const [todayStopped, setTodayStopped] = useState("00h:00m");
  const [todayIdle, setTodayIdle] = useState("00h:00m");
  const [currentStatus, setCurrentStatus] = useState("STOPPED");
  const [timestamp, setTimestamp] = useState(new Date().toLocaleString());

  const requestRef = useRef(null);
  const segmentStartRef = useRef(null);
  const markerRef = useRef(null);

  // Load routes.json
  useEffect(() => {
    const loadRoute = async () => {
      try {
        const res = await fetch("/dummy-route.json");
        if (!res.ok) throw new Error("Failed to load routes.json");
        const allRoutes = await res.json();
        const route = allRoutes[timeline] || allRoutes.today;
        if (!route || route.length === 0) {
          throw new Error("No route data for selected timeline");
        }
        setWaypoints(route);
        await fetchOsrmRoute(route);
      } catch (err) {
        console.error(err);
        setError(err.message || "Failed to load route");
        setLoading(false);
      }
    };
    loadRoute();
  }, [timeline]);

  const fetchOsrmRoute = async (points) => {
    if (points.length < 2) {
      setError("At least 2 points required");
      setLoading(false);
      return;
    }

    try {
      const coords = points.map(p => `${p.longitude},${p.latitude}`).join(";");
      const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=false`;
      const res = await fetch(url);
      const json = await res.json();

      if (json.code !== "Ok" || !json.routes?.[0]) {
        throw new Error("OSRM: No route found");
      }

      const route = json.routes[0].geometry.coordinates.map(([lng, lat]) => [lat, lng]);
      setOsrmRoute(route);
      if (route.length > 0) {
        setAnimPos(route[0]);
        setProgressPercent(0);
        setCurrentSegment(0);
        setTotalDistance(0);
        setDistanceFromLastStop(0);
        setTodayRunning("00h:00m");
        setTodayStopped("00h:00m");
        setTodayIdle("00h:00m");
        setCurrentStatus("STOPPED");
        setTimestamp(new Date().toLocaleString());
      }
      setLoading(false);
    } catch (err) {
      console.warn("OSRM failed, using straight line:", err);
      const fallback = [];
      for (let i = 0; i < points.length - 1; i++) {
        const p1 = [points[i].latitude, points[i].longitude];
        const p2 = [points[i + 1].latitude, points[i + 1].longitude];
        for (let t = 0; t <= 1; t += 0.1) {
          fallback.push([
            p1[0] + (p2[0] - p1[0]) * t,
            p1[1] + (p2[1] - p1[1]) * t,
          ]);
        }
      }
      setOsrmRoute(fallback);
      if (fallback.length > 0) {
        setAnimPos(fallback[0]);
        setProgressPercent(0);
        setCurrentSegment(0);
      }
      setLoading(false);
    }
  };

  // Handle timeline change
  useEffect(() => {
    setIsPlaying(false);
    cancelAnim();
  }, [timeline]);

  const cancelAnim = () => {
    if (requestRef.current) {
      cancelAnimationFrame(requestRef.current);
      requestRef.current = null;
    }
    segmentStartRef.current = null;
  };

  // Start animation along OSRM route
  const startAnimation = () => {
    if (!osrmRoute || osrmRoute.length === 0) {
      setIsPlaying(false);
      return;
    }

    const totalPoints = osrmRoute.length;
    const duration = (1000 / speedFactor) * totalPoints * 0.025;

    segmentStartRef.current = {
      startTime: performance.now(),
      duration,
      totalPoints,
      lastPos: osrmRoute[0],
      lastTime: performance.now(),
    };

    const step = (now) => {
      const seg = segmentStartRef.current;
      if (!seg || !osrmRoute?.length) {
        setIsPlaying(false);
        return;
      }

      const elapsed = now - seg.startTime;
      const progress = Math.min(1, elapsed / seg.duration);
      const index = Math.min(Math.floor(progress * (seg.totalPoints - 1)), seg.totalPoints - 1);
      const pos = osrmRoute[index];

      if (!pos || pos.length < 2) {
        setIsPlaying(false);
        return;
      }

      setAnimPos(pos);
      setProgressPercent(Math.round(progress * 100));

      // Calculate segment index
      const segmentIndex = Math.min(
        Math.floor(progress * (waypoints.length - 1)),
        waypoints.length - 2
      );
      setCurrentSegment(segmentIndex);

      // Calculate estimated speed
      if (index > 0) {
        const prev = osrmRoute[index - 1];
        const dist = Math.sqrt(
          Math.pow(pos[0] - prev[0], 2) + Math.pow(pos[1] - prev[1], 2)
        ) * 111000; // meters per degree
        const timePerStep = (seg.duration / seg.totalPoints) / 1000; // seconds
        const speed = (dist / timePerStep) * 3.6; // m/s to km/h
        setEstimatedSpeed(Math.round(speed));
        setTotalDistance(prev => prev + (dist / 1000)); // km

        // Simulate battery drain
        setBatteryLevel(prev => Math.max(0, prev - 0.01));

        // Update status
        if (speed > 0.5) {
          setCurrentStatus("MOVING");
          setTodayRunning(formatTime(elapsed / 1000));
        } else {
          setCurrentStatus("STOPPED");
          setTodayStopped(formatTime(elapsed / 1000));
        }
      }

      // Rotate marker
      if (index < osrmRoute.length - 1) {
        const next = osrmRoute[index + 1];
        const bearing = bearingBetween(pos[0], pos[1], next[0], next[1]);
        const el = markerRef.current?.getElement();
        const wrapper = el?.querySelector("div");
        if (wrapper) wrapper.style.transform = `rotate(${bearing}deg)`;
      }

      if (progress < 1) {
        requestRef.current = requestAnimationFrame(step);
      } else {
        setIsPlaying(false);
      }
    };

    requestRef.current = requestAnimationFrame(step);
  };

  const formatTime = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h.toString().padStart(2, '0')}h:${m.toString().padStart(2, '0')}m`;
  };

  useEffect(() => {
    if (isPlaying) startAnimation();
    return () => cancelAnim();
  }, [isPlaying, speedFactor]);

  // Handle slider change
  const handleSliderChange = (e) => {
    setIsPlaying(false);
    cancelAnim();
    const newPercent = Number(e.target.value);
    setProgressPercent(newPercent);

    const index = Math.floor((newPercent / 100) * (osrmRoute.length - 1));
    if (osrmRoute[index]) {
      setAnimPos(osrmRoute[index]);
    }
  };

  const handlePlayPause = () => {
    if (!isPlaying && (!osrmRoute || osrmRoute.length === 0)) {
      alert("Route not ready. Please wait.");
      return;
    }
    setIsPlaying(!isPlaying);
  };

  const handleRestart = () => {
    setIsPlaying(false);
    cancelAnim();
    setTimeout(() => {
      if (osrmRoute.length > 0) {
        setAnimPos(osrmRoute[0]);
        setProgressPercent(0);
        setCurrentSegment(0);
        setTotalDistance(0);
        setDistanceFromLastStop(0);
        setTodayRunning("00h:00m");
        setTodayStopped("00h:00m");
        setTodayIdle("00h:00m");
        setCurrentStatus("STOPPED");
        setTimestamp(new Date().toLocaleString());
        setIsPlaying(true);
      }
    }, 100);
  };

  // UI
  if (error) {
    return (
      <div style={{ padding: "40px", textAlign: "center", color: "red", fontSize: "18px" }}>
        ❌ {error}
      </div>
    );
  }

  if (loading || !animPos) {
    return (
      <div style={{ padding: "40px", textAlign: "center", fontSize: "18px", color: "#4b5563" }}>
        🗺️ Loading route for <strong>{timeline}</strong>... Please wait.
      </div>
    );
  }

  const currentWaypoint = waypoints[currentSegment] || waypoints[0] || {};
  const nextWaypoint = waypoints[currentSegment + 1] || waypoints[waypoints.length - 1] || {};

  return (
    <div style={{
      width: "96%",
      maxWidth: "1300px",
      margin: "20px auto",
      fontFamily: "'Segoe UI', system-ui, sans-serif",
      display: "grid",
      gap: "16px"
    }}>
      {/* Map */}
      <div style={{
        height: "70vh",
        borderRadius: "16px",
        overflow: "hidden",
        boxShadow: "0 10px 30px rgba(0,0,0,0.12)",
        border: "1px solid #eee"
      }}>
        <MapContainer center={animPos} zoom={13} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
          <Recenter center={animPos} />
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          />

          {/* Route */}
          {osrmRoute.length > 1 && (
            <Polyline positions={osrmRoute} pathOptions={{ color: "#3b82f6", weight: 6, opacity: 0.85 }} />
          )}

          {/* Waypoint markers */}
          {waypoints.map((wp, i) => (
            <Marker key={i} position={[wp.latitude, wp.longitude]} icon={waypointIcon()}>
              <Popup>
                <div style={{ minWidth: "180px", padding: "10px" }}>
                  <div style={{ fontWeight: "600", color: "#10b981", fontSize: "14px" }}>{wp.name}</div>
                  <div style={{ fontSize: "12px", color: "#4b5563", marginTop: "4px" }}>ETA: {wp.eta}</div>
                </div>
              </Popup>
            </Marker>
          ))}

          {/* Vehicle */}
          <Marker position={animPos} icon={vehicleDivIcon(52)} ref={markerRef}>
            <Popup>
              <div style={{
                minWidth: "320px",
                padding: "16px",
                backgroundColor: "white",
                borderRadius: "12px",
                boxShadow: "0 4px 12px rgba(0,0,0,0.1)"
              }}>
                <div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "12px"
                }}>
                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px"
                  }}>
                    <div style={{
                      width: "40px",
                      height: "40px",
                      borderRadius: "10px",
                      background: "linear-gradient(135deg, #3b82f6, #1d4ed8)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "white",
                      fontSize: "18px"
                    }}>
                      🚖
                    </div>
                    <div>
                      <div style={{ fontWeight: "700", fontSize: "16px", color: "#1e3a8a" }}>Hyderabad Taxi #24</div>
                      <div style={{ fontSize: "12px", color: "#64748b" }}>🟢 Live • GPS Active</div>
                    </div>
                  </div>
                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    fontSize: "12px",
                    color: "#4b5563"
                  }}>
                    <i className="fa-regular fa-clock"></i>
                    <span>{timestamp}</span>
                  </div>
                </div>

                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: "10px",
                  marginBottom: "12px"
                }}>
                  <div style={{
                    padding: "10px",
                    background: "#f8fafc",
                    borderRadius: "8px",
                    textAlign: "center"
                  }}>
                    <div style={{ fontSize: "14px", fontWeight: "600", color: "#1e3a8a" }}>{estimatedSpeed.toFixed(2)} km/h</div>
                    <div style={{ fontSize: "12px", color: "#64748b" }}>Speed</div>
                  </div>
                  <div style={{
                    padding: "10px",
                    background: "#f8fafc",
                    borderRadius: "8px",
                    textAlign: "center"
                  }}>
                    <div style={{ fontSize: "14px", fontWeight: "600", color: "#1e3a8a" }}>{totalDistance.toFixed(2)} km</div>
                    <div style={{ fontSize: "12px", color: "#64748b" }}>Total Distance</div>
                  </div>
                  <div style={{
                    padding: "10px",
                    background: "#f8fafc",
                    borderRadius: "8px",
                    textAlign: "center"
                  }}>
                    <div style={{ fontSize: "14px", fontWeight: "600", color: "#1e3a8a" }}>{batteryLevel.toFixed(0)}%</div>
                    <div style={{ fontSize: "12px", color: "#64748b" }}>Battery</div>
                  </div>
                </div>

                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: "10px",
                  marginBottom: "12px"
                }}>
                  <div style={{
                    padding: "10px",
                    background: "#f0fdf4",
                    borderRadius: "8px",
                    textAlign: "center"
                  }}>
                    <div style={{ fontSize: "14px", fontWeight: "600", color: "#0d9488" }}>{todayRunning}</div>
                    <div style={{ fontSize: "12px", color: "#64748b" }}>Today Running</div>
                  </div>
                  <div style={{
                    padding: "10px",
                    background: "#fffbeb",
                    borderRadius: "8px",
                    textAlign: "center"
                  }}>
                    <div style={{ fontSize: "14px", fontWeight: "600", color: "#f59e0b" }}>{todayStopped}</div>
                    <div style={{ fontSize: "12px", color: "#64748b" }}>Today Stopped</div>
                  </div>
                  <div style={{
                    padding: "10px",
                    background: "#fef3fe",
                    borderRadius: "8px",
                    textAlign: "center"
                  }}>
                    <div style={{ fontSize: "14px", fontWeight: "600", color: "#8b5cf6" }}>{todayIdle}</div>
                    <div style={{ fontSize: "12px", color: "#64748b" }}>Today Idle</div>
                  </div>
                </div>

                <div style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "10px",
                  marginBottom: "12px"
                }}>
                  <div style={{
                    padding: "10px",
                    background: "#f0f9ff",
                    borderRadius: "8px"
                  }}>
                    <div style={{ fontSize: "13px", fontWeight: "600", color: "#1e3a8a" }}>📍 Location:</div>
                    <div style={{ fontSize: "12px", color: "#4b5563" }}>{animPos[0].toFixed(5)}, {animPos[1].toFixed(5)}</div>
                  </div>
                  <div style={{
                    padding: "10px",
                    background: "#f0f9ff",
                    borderRadius: "8px"
                  }}>
                    <div style={{ fontSize: "13px", fontWeight: "600", color: "#1e3a8a" }}>🎯 Next Stop:</div>
                    <div style={{ fontSize: "12px", color: "#4b5563" }}>{nextWaypoint.name || "Final Destination"}</div>
                  </div>
                </div>

                <div style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "10px",
                  marginBottom: "12px"
                }}>
                  <div style={{
                    padding: "10px",
                    background: "#f0f9ff",
                    borderRadius: "8px"
                  }}>
                    <div style={{ fontSize: "13px", fontWeight: "600", color: "#1e3a8a" }}>⏱️ ETA:</div>
                    <div style={{ fontSize: "12px", color: "#4b5563" }}>{nextWaypoint.eta || "N/A"}</div>
                  </div>
                  <div style={{
                    padding: "10px",
                    background: "#f0f9ff",
                    borderRadius: "8px"
                  }}>
                    <div style={{ fontSize: "13px", fontWeight: "600", color: "#1e3a8a" }}>📊 Status:</div>
                    <div style={{ fontSize: "12px", color: currentStatus === "MOVING" ? "#0d9488" : "#ef4444" }}>
                      {currentStatus}
                    </div>
                  </div>
                </div>

                <div style={{
                  display: "flex",
                  justifyContent: "space-around",
                  paddingTop: "12px",
                  borderTop: "1px solid #e2e8f0"
                }}>
                  <div style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    fontSize: "12px",
                    color: "#64748b"
                  }}>
                    <i className="fa-solid fa-key" style={{ fontSize: "18px", color: "#1e3a8a" }}></i>
                    <span>Lock</span>
                  </div>
                  <div style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    fontSize: "12px",
                    color: "#64748b"
                  }}>
                    <i className="fa-solid fa-battery-three-quarters" style={{ fontSize: "18px", color: "#1e3a8a" }}></i>
                    <span>Battery</span>
                  </div>
                  <div style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    fontSize: "12px",
                    color: "#64748b"
                  }}>
                    <i className="fa-solid fa-snowflake" style={{ fontSize: "18px", color: "#1e3a8a" }}></i>
                    <span>AC</span>
                  </div>
                  <div style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    fontSize: "12px",
                    color: "#64748b"
                  }}>
                    <i className="fa-solid fa-gas-pump" style={{ fontSize: "18px", color: "#1e3a8a" }}></i>
                    <span>Fuel</span>
                  </div>
                  <div style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    fontSize: "12px",
                    color: "#64748b"
                  }}>
                    <i className="fa-solid fa-lock" style={{ fontSize: "18px", color: "#1e3a8a" }}></i>
                    <span>Security</span>
                  </div>
                </div>
              </div>
            </Popup>
          </Marker>
        </MapContainer>
      </div>

      {/* Controls - Responsive Grid */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr",
        gap: "16px",
        background: "white",
        padding: "16px",
        borderRadius: "16px",
        boxShadow: "0 4px 20px rgba(0,0,0,0.08)"
      }}>
        {/* Progress Slider */}
        <div style={{ padding: "0 10px" }}>
          <label style={{ fontSize: "12px", color: "#475569", display: "block", marginBottom: "6px" }}>
            📍 Journey Progress: {progressPercent}%
          </label>
          <input
            type="range"
            min="0"
            max="100"
            value={progressPercent}
            onChange={handleSliderChange}
            style={{
              width: "100%",
              height: "6px",
              borderRadius: "10px",
              background: "#e2e8f0",
              outline: "none",
              cursor: "pointer"
            }}
          />
        </div>

        {/* Buttons & Timeline */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "12px",
          alignItems: "center"
        }}>
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
            <button onClick={handlePlayPause} style={{
              padding: "10px 18px",
              borderRadius: "12px",
              border: "none",
              background: isPlaying ? "#ef4444" : "#10b981",
              color: "white",
              fontWeight: "600",
              cursor: "pointer",
              boxShadow: "0 4px 10px rgba(0,0,0,0.1)",
              minWidth: "100px"
            }}>
              {isPlaying ? "⏸️ Pause" : "▶️ Play"}
            </button>
            <button onClick={handleRestart} style={{
              padding: "10px 18px",
              borderRadius: "12px",
              border: "none",
              background: "#8b5cf6",
              color: "white",
              fontWeight: "600",
              cursor: "pointer",
              boxShadow: "0 4px 10px rgba(139, 92, 246, 0.3)",
              minWidth: "100px"
            }}>
              🔁 Restart
            </button>
          </div>

          <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
            <div>
              <label style={{ fontSize: "12px", color: "#475569", display: "block", marginBottom: "4px" }}>Timeline</label>
              <select
                value={timeline}
                onChange={(e) => setTimeline(e.target.value)}
                style={{
                  padding: "8px 12px",
                  borderRadius: "10px",
                  border: "1px solid #cbd5e1",
                  fontSize: "14px",
                  minWidth: "140px"
                }}
              >
                <option value="today">Today</option>
                <option value="yesterday">Yesterday</option>
                <option value="lastweek">Last Week</option>
                <option value="lastmonth">Last Month</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: "12px", color: "#475569", display: "block", marginBottom: "4px" }}>Speed</label>
              <select
                value={speedFactor}
                onChange={(e) => setSpeedFactor(Number(e.target.value))}
                style={{
                  padding: "8px 12px",
                  borderRadius: "10px",
                  border: "1px solid #cbd5e1",
                  fontSize: "14px",
                  minWidth: "80px"
                }}
              >
                <option value="0.5">0.5x</option>
                <option value="1">1x</option>
                <option value="2">2x</option>
                <option value="3">3x</option>
                <option value="5">5x</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}