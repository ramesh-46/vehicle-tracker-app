import React from "react";
import VehicleMap from "./VehicleMap";
import "@fortawesome/fontawesome-free/css/all.min.css";

export default function App() {
  const appStyle = {
    height: "100vh",
    width: "100%",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    backgroundColor: "#f4f6fb",
    fontFamily: "Inter, Roboto, Arial, sans-serif",
  };

  const headerStyle = {
    width: "100%",
    padding: "14px 18px",
    boxSizing: "border-box",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    background: "linear-gradient(90deg,#ffffff,#f0f3ff)",
    boxShadow: "0 1px 6px rgba(10,10,10,0.08)",
  };

  const titleStyle = {
    fontSize: 18,
    fontWeight: 700,
    color: "#222",
  };

  return (
    <div style={appStyle}>
      <header style={headerStyle}>
        <div style={titleStyle}>🚘 Vehicle Tracker — Amerpet → HiTech City</div>
        <div style={{ color: "#666", fontSize: 14 }}>
          Demo timeline & smooth animation • inline styles only
        </div>
      </header>

      <main style={{ flex: 1, width: "100%", display: "flex", justifyContent: "center", alignItems: "center" }}>
        <VehicleMap />
      </main>
    </div>
  );
}
