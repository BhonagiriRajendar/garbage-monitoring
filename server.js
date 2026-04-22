const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const admin = require("firebase-admin");

// 1. INITIALIZE FIREBASE
// Note: You need to download your serviceAccountKey.json from Firebase Console
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://garbage-monitoring-23b5d-default-rtdb.firebaseio.com" // Replace with your Firebase DB URL
});

const db = admin.firestore(); // Using Firestore for better location queries
const app = express();

app.use(cors());
app.use(bodyParser.json());
app.use(express.static("public"));

// 2. API TO RECEIVE DATA FROM ESP32
app.post("/alert", async (req, res) => {
    const { binId, fillLevel, status, lat, lng } = req.body;
    const currentTime = new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" });

    try {
        // Fetch current bin data to check if status is changing
        const binRef = db.collection("bins").doc(binId);
        const doc = await binRef.get();
        let filledAtTime = "Not yet full";

        if (doc.exists) {
            const data = doc.data();
            filledAtTime = data.filledAt || "Not yet full";
            
            // Logic: If it just became full, update the 'filledAt' timestamp
            if (status === "Full" && data.status !== "Full") {
                filledAtTime = currentTime;
            } else if (status === "OK") {
                filledAtTime = "Cleared";
            }
        } else if (status === "Full") {
            filledAtTime = currentTime;
        }

        // Save/Update in Firebase
        const binData = {
            binId,
            fillLevel,
            status,
            lat: lat || 17.3850,
            lng: lng || 78.4867,
            filledAt: filledAtTime,
            lastSeen: currentTime
        };

        await binRef.set(binData, { merge: true });
        
        console.log(`✅ Data synced to Firebase for ${binId}`);
        res.json({ success: true });
    } catch (error) {
        console.error("❌ Firebase Error:", error);
        res.status(500).json({ error: error.message });
    }
});

// 3. API FOR DASHBOARD TO GET DATA
app.get("/api/bins", async (req, res) => {
    try {
        const snapshot = await db.collection("bins").get();
        const bins = snapshot.docs.map(doc => doc.data());
        res.json(bins);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));