import express from "express";

import {
  authenticateUser,
  authorizeRoles,
} from "../middleware/authMiddleware.js";

import {
  updateEmploymentDetails,
} from "../controllers/adminUserController.js";

const router = express.Router();

/*
 * Only administrators can change employment status
 * and joined date.
 */
router.patch(
  "/:userId/employment",
  authenticateUser,
  authorizeRoles("ADMIN"),
  updateEmploymentDetails,
);

export default router;