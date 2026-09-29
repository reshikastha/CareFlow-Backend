import express from "express";

import {
  createIncident,
  deleteIncident,
  getIncident,
  getIncidentActivities,
  getIncidents,
  updateIncident,
  updateIncidentStatus,
} from "../controllers/incidentController.js";

import {
  authenticateUser,
  authorizeRoles,
} from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(authenticateUser);

router.get("/", authorizeRoles("ADMIN", "CARE_WORKER"), getIncidents);
router.post("/", authorizeRoles("ADMIN", "CARE_WORKER"), createIncident);

router.get(
  "/:incidentId/activities",
  authorizeRoles("ADMIN", "CARE_WORKER"),
  getIncidentActivities,
);

router.patch(
  "/:incidentId/status",
  authorizeRoles("ADMIN"),
  updateIncidentStatus,
);

router.get(
  "/:incidentId",
  authorizeRoles("ADMIN", "CARE_WORKER"),
  getIncident,
);

router.patch(
  "/:incidentId",
  authorizeRoles("ADMIN", "CARE_WORKER"),
  updateIncident,
);

router.delete(
  "/:incidentId",
  authorizeRoles("ADMIN"),
  deleteIncident,
);

export default router;