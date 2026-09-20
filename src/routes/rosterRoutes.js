import express from "express";

import {
  authenticateUser,
  authorizeRoles,
} from "../middleware/authMiddleware.js";

import {
  getRoster,
  createRosterShift,
  updateShiftStatus,
} from "../controllers/rosterController.js";

const router = express.Router();

// Admin sees all shifts.
// Care worker only receives their own shifts.
router.get(
  "/",
  authenticateUser,
  authorizeRoles("ADMIN", "CARE_WORKER"),
  getRoster,
);

// Only admins create roster shifts.
router.post(
  "/",
  authenticateUser,
  authorizeRoles("ADMIN"),
  createRosterShift,
);

// Care workers update the status of their own shifts.
router.patch(
  "/:shiftId/status",
  authenticateUser,
  authorizeRoles("CARE_WORKER"),
  updateShiftStatus,
);

export default router;