import express from "express";

import {
  registerUser,
  loginUser,
} from "../controllers/authController.js";

// Create an Express router for authentication routes.
const router = express.Router();

/*
 * Registration endpoint
 * Complete URL: POST /api/auth/register
 */
router.post("/register", registerUser);

/*
 * Login endpoint
 * Complete URL: POST /api/auth/login
 */
router.post("/login", loginUser);

// Export the router so server.js can use it.
export default router;