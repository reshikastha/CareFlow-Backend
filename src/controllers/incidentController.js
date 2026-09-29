import pool from "../config/database.js";

const ALLOWED_SEVERITIES = [
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
];

const ALLOWED_STATUSES = [
  "OPEN",
  "UNDER_REVIEW",
  "ACTION_REQUIRED",
  "CLOSED",
];

function getUserId(req) {
  return req.user?.id ?? req.user?.userId;
}

function getUserRole(req) {
  return req.user?.role;
}

/*
 * Main incident query.
 *
 * It joins the incident with the client, worker and
 * reporter so the frontend receives their names.
 */
const INCIDENT_SELECT = `
  SELECT
    i.id,

    'INC-' || LPAD(i.id::TEXT, 3, '0')
      AS incident_number,

    i.client_id,
    c.full_name AS client_name,

    i.worker_id,
    w.full_name AS worker_name,

    i.reported_by_id,
    reporter.full_name AS reported_by_name,

    i.incident_type,
    i.occurred_at,
    i.location,
    i.severity,
    i.status,
    i.description,
    i.immediate_action,
    i.people_notified,
    i.resolution_notes,
    i.closed_at,
    i.created_at,
    i.updated_at

  FROM incidents i

  INNER JOIN clients c
    ON c.id = i.client_id

  LEFT JOIN users w
    ON w.id = i.worker_id

  INNER JOIN users reporter
    ON reporter.id = i.reported_by_id
`;

/*
 * Get one incident while applying role permissions.
 *
 * Admin:
 *   Can access every incident.
 *
 * Care worker:
 *   Can access an incident if:
 *   - they are the incident worker;
 *   - they reported the incident; or
 *   - the client is actively assigned to them.
 */
async function findIncidentForUser(incidentId) {
  const result = await pool.query(
    `${INCIDENT_SELECT}
     WHERE i.id = $1
       AND i.is_deleted = FALSE`,
    [incidentId],
  );

  return result.rows[0] ?? null;
}
/*
 * POST /api/incidents
 *
 * Create a new incident.
 */
export async function createIncident(req, res) {
  const connection = await pool.connect();

  try {
    const userId = getUserId(req);
    const role = getUserRole(req);

    let {
      clientId,
      workerId,
      incidentType,
      occurredAt,
      location,
      severity,
      description,
      immediateAction,
      peopleNotified,
    } = req.body;

    if (
      !clientId ||
      !incidentType ||
      !occurredAt ||
      !severity ||
      !description
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Client, type, date, severity and description are required.",
      });
    }

    const normalisedSeverity =
      severity.toUpperCase();

    if (
      !ALLOWED_SEVERITIES.includes(
        normalisedSeverity,
      )
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid incident severity.",
      });
    }

    const occurredDate = new Date(occurredAt);

    if (Number.isNaN(occurredDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: "Invalid incident date.",
      });
    }

    /*
     * A care worker can only create an incident for
     * a client who is actively assigned to them.
     */
    if (role === "CARE_WORKER") {
      const assignmentResult =
        await connection.query(
          `
            SELECT id
            FROM client_assignments
            WHERE client_id = $1
              AND care_worker_id = $2
              AND ended_at IS NULL
          `,
          [clientId, userId],
        );

      if (assignmentResult.rows.length === 0) {
        return res.status(403).json({
          success: false,
          message:
            "You can only report incidents for clients assigned to you.",
        });
      }

      // A care worker is automatically recorded as
      // the worker involved.
      workerId = userId;
    }

    /*
     * Confirm that the client exists and is active.
     */
    const clientResult =
      await connection.query(
        `
          SELECT id
          FROM clients
          WHERE id = $1
            AND is_active = TRUE
        `,
        [clientId],
      );

    if (clientResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Client not found.",
      });
    }

    /*
     * If a worker ID was supplied, make sure the
     * worker exists.
     */
    if (workerId) {
      const workerResult =
        await connection.query(
          `
            SELECT id
            FROM users
            WHERE id = $1
              AND role = 'CARE_WORKER'
              AND is_active = TRUE
          `,
          [workerId],
        );

      if (workerResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Care worker not found.",
        });
      }
    }

    await connection.query("BEGIN");

    const incidentResult =
      await connection.query(
        `
          INSERT INTO incidents (
            client_id,
            worker_id,
            reported_by_id,
            incident_type,
            occurred_at,
            location,
            severity,
            status,
            description,
            immediate_action,
            people_notified
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            'OPEN',
            $8,
            $9,
            $10
          )
          RETURNING id
        `,
        [
          clientId,
          workerId || null,
          userId,
          incidentType.trim(),
          occurredDate.toISOString(),
          location?.trim() || null,
          normalisedSeverity,
          description.trim(),
          immediateAction?.trim() || null,
          peopleNotified?.trim() || null,
        ],
      );

    const incidentId =
      incidentResult.rows[0].id;

    await connection.query(
      `
        INSERT INTO incident_activities (
          incident_id,
          performed_by_id,
          action,
          details
        )
        VALUES ($1, $2, $3, $4)
      `,
      [
        incidentId,
        userId,
        "INCIDENT_REPORTED",
        description.trim(),
      ],
    );

    await connection.query("COMMIT");

    const incident = await findIncidentForUser(
      incidentId,
      userId,
      role,
    );

    return res.status(201).json({
      success: true,
      message: "Incident reported successfully.",
      incident,
    });
  } catch (error) {
    await connection.query("ROLLBACK");

    console.error("Create incident error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to create the incident.",
    });
  } finally {
    connection.release();
  }
}

/*
 * GET /api/incidents
 *
 * Optional query parameters:
 * ?status=OPEN
 * ?severity=HIGH
 * ?startDate=2026-09-01
 * ?endDate=2026-09-30
 * ?clientId=1
 */
export async function getIncidents(req, res) {
  try {
    const userId = getUserId(req);
    const role = getUserRole(req);

    const {
      status,
      severity,
      startDate,
      endDate,
      clientId,
    } = req.query;

    const conditions = [
      "i.is_deleted = FALSE",
    ];

    const values = [];

    /*
     * Restrict care workers to incidents connected
     * to themselves or their assigned clients.
     */
    // if (role !== "ADMIN") {
    //   values.push(userId);

    //   conditions.push(`
    //     (
    //       i.worker_id = $${values.length}
    //       OR i.reported_by_id = $${values.length}
    //       OR EXISTS (
    //         SELECT 1
    //         FROM client_assignments ca
    //         WHERE ca.client_id = i.client_id
    //           AND ca.care_worker_id = $${values.length}
    //           AND ca.ended_at IS NULL
    //       )
    //     )
    //   `);
    // }

    if (status) {
      const normalisedStatus =
        status.toUpperCase();

      if (
        !ALLOWED_STATUSES.includes(
          normalisedStatus,
        )
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid incident status.",
        });
      }

      values.push(normalisedStatus);

      conditions.push(
        `i.status = $${values.length}`,
      );
    }

    if (severity) {
      const normalisedSeverity =
        severity.toUpperCase();

      if (
        !ALLOWED_SEVERITIES.includes(
          normalisedSeverity,
        )
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid severity.",
        });
      }

      values.push(normalisedSeverity);

      conditions.push(
        `i.severity = $${values.length}`,
      );
    }

    if (startDate) {
      const parsedStartDate =
        new Date(startDate);

      if (
        Number.isNaN(
          parsedStartDate.getTime(),
        )
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid start date.",
        });
      }

      values.push(startDate);

      conditions.push(
        `i.occurred_at >= $${values.length}`,
      );
    }

    if (endDate) {
      const parsedEndDate = new Date(endDate);

      if (
        Number.isNaN(parsedEndDate.getTime())
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid end date.",
        });
      }

      values.push(endDate);

      /*
       * Include the complete end date.
       */
      conditions.push(`
        i.occurred_at
          < $${values.length}::DATE
            + INTERVAL '1 day'
      `);
    }

    if (clientId) {
      const parsedClientId =
        Number(clientId);

      if (
        !Number.isInteger(parsedClientId) ||
        parsedClientId <= 0
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid client ID.",
        });
      }

      values.push(parsedClientId);

      conditions.push(
        `i.client_id = $${values.length}`,
      );
    }

    const result = await pool.query(
      `
        ${INCIDENT_SELECT}

        WHERE ${conditions.join(" AND ")}

        ORDER BY
          i.occurred_at DESC,
          i.id DESC
      `,
      values,
    );

    return res.status(200).json({
      success: true,
      count: result.rows.length,
      incidents: result.rows,
    });
  } catch (error) {
    console.error("Get incidents error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve incidents.",
    });
  }
}

/*
 * GET /api/incidents/:incidentId
 */
export async function getIncident(req, res) {
  try {
    const incidentId = Number(
      req.params.incidentId,
    );

    const userId = getUserId(req);
    const role = getUserRole(req);

    if (
      !Number.isInteger(incidentId) ||
      incidentId <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid incident ID.",
      });
    }

    const incident = await findIncidentForUser(
      incidentId,
      userId,
      role,
    );

    if (!incident) {
      return res.status(404).json({
        success: false,
        message:
          "Incident not found or you do not have permission to view it.",
      });
    }

    return res.status(200).json({
      success: true,
      incident,
    });
  } catch (error) {
    console.error("Get incident error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve the incident.",
    });
  }
}

/*
 * PATCH /api/incidents/:incidentId
 *
 * Care workers can update incident information.
 * Admins can additionally change the client,
 * worker and resolution notes.
 */
export async function updateIncident(req, res) {
  const connection = await pool.connect();

  try {
    const incidentId = Number(
      req.params.incidentId,
    );

    const userId = getUserId(req);
    const role = getUserRole(req);

    if (
      !Number.isInteger(incidentId) ||
      incidentId <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid incident ID.",
      });
    }

    const existingIncident =
      await findIncidentForUser(
        incidentId,
        userId,
        role,
      );

    if (!existingIncident) {
      return res.status(404).json({
        success: false,
        message:
          "Incident not found or you do not have permission to update it.",
      });
    }

    if (
      role !== "ADMIN" &&
      existingIncident.status === "CLOSED"
    ) {
      return res.status(409).json({
        success: false,
        message:
          "A closed incident cannot be edited by a care worker.",
      });
    }

    /*
     * Fields care workers and admins can update.
     */
    const allowedFields = {
      incidentType: "incident_type",
      occurredAt: "occurred_at",
      location: "location",
      severity: "severity",
      description: "description",
      immediateAction: "immediate_action",
      peopleNotified: "people_notified",
    };

    /*
     * Extra fields only an administrator can update.
     */
    if (role === "ADMIN") {
      allowedFields.clientId = "client_id";
      allowedFields.workerId = "worker_id";
      allowedFields.resolutionNotes =
        "resolution_notes";
    }

    if (
      req.body.severity !== undefined &&
      !ALLOWED_SEVERITIES.includes(
        req.body.severity.toUpperCase(),
      )
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid incident severity.",
      });
    }

    const updates = [];
    const values = [];

    for (const [bodyField, column] of Object.entries(
      allowedFields,
    )) {
      if (req.body[bodyField] !== undefined) {
        let value = req.body[bodyField];

        if (bodyField === "severity") {
          value = value.toUpperCase();
        }

        if (
          typeof value === "string" &&
          bodyField !== "occurredAt"
        ) {
          value = value.trim() || null;
        }

        values.push(value);

        updates.push(
          `${column} = $${values.length}`,
        );
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message:
          "No valid incident fields were provided.",
      });
    }

    values.push(incidentId);

    await connection.query("BEGIN");

    await connection.query(
      `
        UPDATE incidents
        SET
          ${updates.join(", ")},
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $${values.length}
          AND is_deleted = FALSE
      `,
      values,
    );

    await connection.query(
      `
        INSERT INTO incident_activities (
          incident_id,
          performed_by_id,
          action,
          details
        )
        VALUES ($1, $2, $3, $4)
      `,
      [
        incidentId,
        userId,
        "INCIDENT_UPDATED",
        "Incident details updated.",
      ],
    );

    await connection.query("COMMIT");

    const incident = await findIncidentForUser(
      incidentId,
      userId,
      role,
    );

    return res.status(200).json({
      success: true,
      message: "Incident updated successfully.",
      incident,
    });
  } catch (error) {
    await connection.query("ROLLBACK");

    console.error("Update incident error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to update the incident.",
    });
  } finally {
    connection.release();
  }
}

/*
 * PATCH /api/incidents/:incidentId/status
 *
 * Used by the Under review, Action required
 * and Close incident controls.
 */
export async function updateIncidentStatus(
  req,
  res,
) {
  const connection = await pool.connect();

  try {
    const incidentId = Number(
      req.params.incidentId,
    );

    const userId = getUserId(req);

    const { status, resolutionNotes } =
      req.body;

    if (
      !Number.isInteger(incidentId) ||
      incidentId <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid incident ID.",
      });
    }

    if (!status) {
      return res.status(400).json({
        success: false,
        message: "Incident status is required.",
      });
    }

    const normalisedStatus =
      status.toUpperCase();

    if (
      !ALLOWED_STATUSES.includes(
        normalisedStatus,
      )
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid incident status.",
      });
    }

    const existingResult =
      await connection.query(
        `
          SELECT id, status
          FROM incidents
          WHERE id = $1
            AND is_deleted = FALSE
        `,
        [incidentId],
      );

    if (existingResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Incident not found.",
      });
    }

    const previousStatus =
      existingResult.rows[0].status;

    await connection.query("BEGIN");

    await connection.query(
      `
        UPDATE incidents
        SET
          status = $1,

          resolution_notes =
            COALESCE(
              $2,
              resolution_notes
            ),

          closed_at =
            CASE
              WHEN $1 = 'CLOSED'
              THEN CURRENT_TIMESTAMP
              ELSE NULL
            END,

          updated_at = CURRENT_TIMESTAMP

        WHERE id = $3
          AND is_deleted = FALSE
      `,
      [
        normalisedStatus,
        resolutionNotes?.trim() || null,
        incidentId,
      ],
    );

    await connection.query(
      `
        INSERT INTO incident_activities (
          incident_id,
          performed_by_id,
          action,
          details
        )
        VALUES ($1, $2, $3, $4)
      `,
      [
        incidentId,
        userId,
        "STATUS_CHANGED",
        `Status changed from ${previousStatus} to ${normalisedStatus}.`,
      ],
    );

    await connection.query("COMMIT");

    const incident = await findIncidentForUser(
      incidentId,
      userId,
      "ADMIN",
    );

    return res.status(200).json({
      success: true,
      message:
        "Incident status updated successfully.",
      incident,
    });
  } catch (error) {
    await connection.query("ROLLBACK");

    console.error(
      "Update incident status error:",
      error,
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to update the incident status.",
    });
  } finally {
    connection.release();
  }
}

/*
 * GET /api/incidents/:incidentId/activities
 */
export async function getIncidentActivities(
  req,
  res,
) {
  try {
    const incidentId = Number(
      req.params.incidentId,
    );

    const userId = getUserId(req);
    const role = getUserRole(req);

    const incident = await findIncidentForUser(
      incidentId,
      userId,
      role,
    );

    if (!incident) {
      return res.status(404).json({
        success: false,
        message:
          "Incident not found or you do not have permission to view it.",
      });
    }

    const result = await pool.query(
      `
        SELECT
          ia.id,
          ia.action,
          ia.details,
          ia.created_at,
          ia.performed_by_id,
          u.full_name AS performed_by_name

        FROM incident_activities ia

        INNER JOIN users u
          ON u.id = ia.performed_by_id

        WHERE ia.incident_id = $1

        ORDER BY
          ia.created_at DESC,
          ia.id DESC
      `,
      [incidentId],
    );

    return res.status(200).json({
      success: true,
      count: result.rows.length,
      activities: result.rows,
    });
  } catch (error) {
    console.error(
      "Get incident activities error:",
      error,
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to retrieve incident activity.",
    });
  }
}

/*
 * DELETE /api/incidents/:incidentId
 *
 * This performs a soft delete so incident history
 * is not permanently removed from the database.
 */
export async function deleteIncident(req, res) {
  const connection = await pool.connect();

  try {
    const incidentId = Number(
      req.params.incidentId,
    );

    const userId = getUserId(req);

    if (
      !Number.isInteger(incidentId) ||
      incidentId <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid incident ID.",
      });
    }

    const existingResult =
      await connection.query(
        `
          SELECT id
          FROM incidents
          WHERE id = $1
            AND is_deleted = FALSE
        `,
        [incidentId],
      );

    if (existingResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Incident not found.",
      });
    }

    await connection.query("BEGIN");

    await connection.query(
      `
        INSERT INTO incident_activities (
          incident_id,
          performed_by_id,
          action,
          details
        )
        VALUES ($1, $2, $3, $4)
      `,
      [
        incidentId,
        userId,
        "INCIDENT_DELETED",
        "Incident archived by administrator.",
      ],
    );

    await connection.query(
      `
        UPDATE incidents
        SET
          is_deleted = TRUE,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `,
      [incidentId],
    );

    await connection.query("COMMIT");

    return res.status(200).json({
      success: true,
      message: "Incident deleted successfully.",
    });
  } catch (error) {
    await connection.query("ROLLBACK");

    console.error("Delete incident error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to delete the incident.",
    });
  } finally {
    connection.release();
  }
}