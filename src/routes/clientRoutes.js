import express from "express";

import {
  authenticateUser,
  authorizeRoles,
} from "../middleware/authMiddleware.js";

import {
  getClients,
  createClient,
  updateClient,
  assignClient,
  deleteClient,
} from "../controllers/clientController.js";

const router = express.Router();

// Admin sees all clients.
// Care worker only sees assigned clients.
router.get(
  "/",
  authenticateUser,
  authorizeRoles("ADMIN", "CARE_WORKER"),
  getClients,
);

// Only admins can create clients.
router.post(
  "/",
  authenticateUser,
  authorizeRoles("ADMIN"),
  createClient,
);

// Only admins can update clients.
router.patch(
  "/:clientId",
  authenticateUser,
  authorizeRoles("ADMIN"),
  updateClient,
);

// Assign a client to a care worker.
router.post(
  "/:clientId/assign",
  authenticateUser,
  authorizeRoles("ADMIN"),
  assignClient,
);

router.delete(
  "/:clientId",
  authenticateUser,
  authorizeRoles("ADMIN"),
  deleteClient,
);

export default router;