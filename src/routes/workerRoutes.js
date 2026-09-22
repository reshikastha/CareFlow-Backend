import express from "express";

import {
  authenticateUser,
  authorizeRoles,
} from "../middleware/authMiddleware.js";

import {
  getWorkers,
  getWorkerById,
  updateWorker,
  deleteWorker,
} from "../controllers/workerController.js";

const router = express.Router();

// Only admins can manage workers.
router.get(
  "/",
  authenticateUser,
  authorizeRoles("ADMIN"),
  getWorkers,
);

router.get(
  "/:workerId",
  authenticateUser,
  authorizeRoles("ADMIN"),
  getWorkerById,
);

router.patch(
  "/:workerId",
  authenticateUser,
  authorizeRoles("ADMIN"),
  updateWorker,
);

router.delete(
  "/:workerId",
  authenticateUser,
  authorizeRoles("ADMIN"),
  deleteWorker,
);

export default router;