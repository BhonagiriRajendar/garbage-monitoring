// ============================================================
//  EcoTrack Backend — server.js
//  FIXED VERSION — env-var credentials + error hardening
// ============================================================

const express     = require("express");
const bodyParser  = require("body-parser");
const cors        = require("cors");
const admin       = require("firebase-admin");

// 1. INITIALIZE FIREBASE
//    FIX BUG 3: Support both local (serviceAccountKey.json) and
//    Render (environment variables) so the server never crashes on deploy.
let credential;

if (
  process.env.FIREBASE_PROJECT_ID &&
  process.env.FIREBASE_CLIENT_EMAIL &&
  process.env.FIREBASE_PRIVATE_KEY
) {
  // Production on Render: use env vars (add these in Render → Environment)
  credential = admin.credential.cert({
    projectId:   process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    // Render stores \n as literal \\n in env vars — this fixes the key
    privateKey:  process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  });
  console.log("🔑 Firebase: using environment variables");
} else {
  // Local development: use the JSON key file
  const serviceAccount = require("./serviceAccountKey.json");
  credential = admin.credential.cert(serviceAccount);
  console.log("🔑 Firebase: using serviceAccountKey.json");
}

admin.initializeApp({
  credential,
  databaseURL: "https://garbage-b1af2-default-rtdb.firebaseio.com/",
});

const db  = admin.database();
const app = express();

app.use(cors());
app.use(bodyParser.json());
app.use(express.static("public"));

// -------------------------------------------------------
//  POST /alert  — receive data from ESP32
// -------------------------------------------------------
app.post("/alert", async (req, res) => {
  const { binId, fillLevel, status, lat, lng } = req.body;

  // Basic validation — reject incomplete payloads
  if (!binId || fillLevel === undefined || !status) {
    return res.status(400).json({ error: "Missing required fields: binId, fillLevel, status" });
  }

  const currentTime = new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" });

  try {
    const binRef = db.ref("bins/" + binId);

    // Fetch current data to check previous status
    const snapshot     = await binRef.once("value");
    const existingData = snapshot.val() || {};

    let filledAtTime = existingData.filledAt || "Not yet full";

    // Capture exact IST time the bin first becomes full
    if (status === "Full" && existingData.status !== "Full") {
      filledAtTime = currentTime;
    } else if (status === "OK") {
      filledAtTime = "Cleared";
    }

    const binData = {
      binId:      binId,
      fillLevel:  fillLevel,
      status:     status,
      lat:        lat  || 17.3850,   // fallback to Hussain Sagar
      lng:        lng  || 78.4867,
      filledAt:   filledAtTime,
      lastSeen:   currentTime,
    };

    await binRef.set(binData);

    console.log(`✅ DB synced — ${binId}: ${fillLevel}% (${status})`);
    res.json({ success: true });

  } catch (error) {
    console.error("❌ Firebase Error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// -------------------------------------------------------
//  GET /api/bins  — serve bin data to dashboard
// -------------------------------------------------------
app.get("/api/bins", async (req, res) => {
  try {
    const snapshot = await db.ref("bins").once("value");
    const binsObj  = snapshot.val() || {};
    const binsArray = Object.values(binsObj);
    res.json(binsArray);
  } catch (error) {
    console.error("❌ Fetch Error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// Health check endpoint (useful for Render uptime monitoring)
app.get("/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 EcoTrack server running on port ${PORT}`);
});
