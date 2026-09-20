import express from "express";

import {
  authenticateUser,
  authorizeRoles,
} from "../middleware/authMiddleware.js";

import {
  getProfile,
  updateProfile,
  addComplianceDocuments,
} from "../controllers/profileController.js";

import {
  uploadProfileImage,
  uploadComplianceDocuments,
} from "../middleware/uploadMiddleware.js";

// Create the profile router.
const router = express.Router();

/*
 * GET /api/profile
 * Get the logged-in user's profile.
 */
router.get(
  "/",
  authenticateUser,
  authorizeRoles("ADMIN", "CARE_WORKER"),
  getProfile,
);

/*
 * PATCH /api/profile
 * Update the logged-in user's profile.
 */
router.patch(
  "/",
  authenticateUser,
  authorizeRoles("ADMIN", "CARE_WORKER"),
  uploadProfileImage,
  updateProfile,
);

/*
 * POST /api/profile/compliance-documents
 * Upload compliance documents.
 */
router.post(
  "/compliance-documents",
  authenticateUser,
  authorizeRoles("ADMIN", "CARE_WORKER"),
  uploadComplianceDocuments,
  addComplianceDocuments,
);

// This default export is required by server.js.
export default router;