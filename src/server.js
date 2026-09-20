import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import authRoutes from "./routes/authRoutes.js";
import profileRoutes from "./routes/profileRoutes.js";
import adminUserRoutes from "./routes/adminUserRoutes.js";


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

// Allow uploaded files to be displayed or downloaded.
app.use(
  "/uploads",
  express.static(path.join(process.cwd(), "uploads")),
);

// Profile endpoints.
app.use("/api/profile", profileRoutes);

// Admin-only user endpoints.
app.use("/api/admin/users", adminUserRoutes);

// Start listening for requests.
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});