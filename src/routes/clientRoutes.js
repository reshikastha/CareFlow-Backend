import express from "express";

import {
  authenticateUser,
  authorizeRoles,
} from "../middleware/authMiddleware.js";

import {
  getClients,
  getClient,
  createClient,
  updateClient,
  assignClient,
  deleteClient,
} from "../controllers/clientController.js";

const router = express.Router();

router.get(
  "/",
  authenticateUser,
  authorizeRoles("ADMIN", "CARE_WORKER"),
  getClients,
);

router.get(
  "/:clientId",
  authenticateUser,
  authorizeRoles("ADMIN", "CARE_WORKER"),
  getClient,
);

router.post(
  "/",
  authenticateUser,
  authorizeRoles("ADMIN"),
  createClient,
);

router.patch(
  "/:clientId",
  authenticateUser,
  authorizeRoles("ADMIN"),
  updateClient,
);

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