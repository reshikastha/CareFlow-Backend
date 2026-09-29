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

// Every incident endpoint requires a valid JWT.
router.use(authenticateUser);

// Admin and care workers can retrieve incidents.
router.get(
  "/",
  authorizeRoles("ADMIN", "CARE_WORKER"),
  getIncidents,
);

// Admin and care workers can report incidents.
router.post(
  "/",
  authorizeRoles("ADMIN", "CARE_WORKER"),
  createIncident,
);

// Get activity timeline.
// Keep this above /:incidentId.
router.get(
  "/:incidentId/activities",
  authorizeRoles("ADMIN", "CARE_WORKER"),
  getIncidentActivities,
);

// Administrators update incident status.
router.patch(
  "/:incidentId/status",
  authorizeRoles("ADMIN"),
  updateIncidentStatus,
);

// Get one incident.
router.get(
  "/:incidentId",
  authorizeRoles("ADMIN", "CARE_WORKER"),
  getIncident,
);

// Update incident information.
router.patch(
  "/:incidentId",
  authorizeRoles("ADMIN", "CARE_WORKER"),
  updateIncident,
);

// Only administrators can delete incidents.
router.delete(
  "/:incidentId",
  authorizeRoles("ADMIN"),
  deleteIncident,
);

export default router;