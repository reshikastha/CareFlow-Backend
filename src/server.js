import "dotenv/config";
import express from "express";
import cors from "cors";
import authRoutes from "./routes/authRoutes.js";

const app = express();
const PORT = process.env.PORT || 5000;

// Allow frontend requests.
app.use(cors());

// Allow JSON request bodies.
app.use(express.json());

// Test the server.
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "CareFlow backend is running.",
  });
});

// Authentication routes.
app.use("/api/auth", authRoutes);

// Start listening for requests.
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});