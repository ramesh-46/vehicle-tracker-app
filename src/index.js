import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "leaflet/dist/leaflet.css";

const rootEl = document.getElementById("root");
createRoot(rootEl).render(<App />);
