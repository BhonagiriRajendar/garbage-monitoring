const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const admin = require("firebase-admin");

// 1. INITIALIZE FIREBASE
// Ensure serviceAccountKey.json is in the same folder as this file
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://garbage-b1af2-default-rtdb.firebaseio.com/" 
});

// Initialize Realtime Database
const db = admin.database(); 
const app = express();

app.use(cors());
app.use(bodyParser.json());
app.use(express.static("public"));

// 2. API TO RECEIVE DATA FROM ESP32
app.post("/alert", async (req, res) => {
    // Destructuring keys sent by ESP32
    const { binId, fillLevel, status, lat, lng } = req.body;
    const currentTime = new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" });

    try {
        // Reference to the specific bin path in Realtime DB
        const binRef = db.ref("bins/" + binId);
        
        // Fetch current data to check the previous status
        const snapshot = await binRef.once("value");
        const existingData = snapshot.val() || {};
        
        let filledAtTime = existingData.filledAt || "Not yet full";

        // Logic: Capture exact time it becomes FULL
        if (status === "Full" && existingData.status !== "Full") {
            filledAtTime = currentTime;
        } else if (status === "OK") {
            filledAtTime = "Cleared";
        }

        // Prepare the updated data object
        const binData = {
            binId: binId || "Unknown_Bin",
            fillLevel: fillLevel || 0,
            status: status || "Unknown",
            lat: lat || 17.3850,
            lng: lng || 78.4867,
            filledAt: filledAtTime,
            lastSeen: currentTime
        };

        // Save/Update in Realtime Database
        await binRef.set(binData);
        
        console.log(`✅ Realtime DB Synced for ${binId}: ${fillLevel}%`);
        res.json({ success: true });
    } catch (error) {
        console.error("❌ Firebase Error:", error);
        res.status(500).json({ error: error.message });
    }
});

// 3. API FOR DASHBOARD TO GET DATA
app.get("/api/bins", async (req, res) => {
    try {
        const snapshot = await db.ref("bins").once("value");
        const binsObj = snapshot.val() || {};
        
        // Realtime DB returns an object of objects. 
        // We convert it to an array so the Frontend map/table can loop through it.
        const binsArray = Object.values(binsObj);
        res.json(binsArray);
    } catch (error) {
        console.error("❌ Fetch Error:", error);
        res.status(500).json({ error: error.message });
    }
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});