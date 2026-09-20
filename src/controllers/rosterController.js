import pool from "../config/database.js";

/*
 * GET ROSTER
 *
 * Admin: sees every roster shift.
 * Care worker: only sees their own shifts.
 */
export const getRoster = async (req, res) => {
  try {
    let result;

    if (req.user.role === "ADMIN") {
      result = await pool.query(
        `SELECT
            rs.id,
            rs.shift_start,
            rs.shift_end,
            rs.status,
            rs.notes,
            c.id AS client_id,
            c.full_name AS client_name,
            u.id AS care_worker_id,
            u.full_name AS care_worker_name
         FROM roster_shifts AS rs
         INNER JOIN clients AS c
            ON c.id = rs.client_id
         INNER JOIN users AS u
            ON u.id = rs.care_worker_id
         ORDER BY rs.shift_start ASC`,
      );
    } else {
      result = await pool.query(
        `SELECT
            rs.id,
            rs.shift_start,
            rs.shift_end,
            rs.status,
            rs.notes,
            c.id AS client_id,
            c.full_name AS client_name,
            c.address AS client_address
         FROM roster_shifts AS rs
         INNER JOIN clients AS c
            ON c.id = rs.client_id
         WHERE rs.care_worker_id = $1
         ORDER BY rs.shift_start ASC`,
        [req.user.id],
      );
    }

    return res.status(200).json({
      success: true,
      count: result.rows.length,
      roster: result.rows,
    });
  } catch (error) {
    console.error("Get roster error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve the roster.",
    });
  }
};

/*
 * CREATE ROSTER SHIFT
 * Admin only.
 */
export const createRosterShift = async (req, res) => {
  try {
    const {
      clientId,
      careWorkerId,
      shiftStart,
      shiftEnd,
      notes,
    } = req.body;

    if (
      !clientId ||
      !careWorkerId ||
      !shiftStart ||
      !shiftEnd
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Client, care worker, start time and end time are required.",
      });
    }

    if (new Date(shiftEnd) <= new Date(shiftStart)) {
      return res.status(400).json({
        success: false,
        message: "Shift end must be after shift start.",
      });
    }

    /*
     * Make sure this worker is assigned to this client.
     */
    const assignmentResult = await pool.query(
      `SELECT id
       FROM client_assignments
       WHERE client_id = $1
         AND care_worker_id = $2
         AND is_active = TRUE`,
      [clientId, careWorkerId],
    );

    if (assignmentResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message:
          "Assign this client to the care worker before creating the shift.",
      });
    }

    /*
     * Check whether the worker already has an overlapping shift.
     */
    const overlapResult = await pool.query(
      `SELECT id
       FROM roster_shifts
       WHERE care_worker_id = $1
         AND status != 'CANCELLED'
         AND shift_start < $3
         AND shift_end > $2`,
      [careWorkerId, shiftStart, shiftEnd],
    );

    if (overlapResult.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message:
          "The care worker already has another shift during this time.",
      });
    }

    const result = await pool.query(
      `INSERT INTO roster_shifts (
          client_id,
          care_worker_id,
          shift_start,
          shift_end,
          notes,
          created_by
       )
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        clientId,
        careWorkerId,
        shiftStart,
        shiftEnd,
        notes || null,
        req.user.id,
      ],
    );

    return res.status(201).json({
      success: true,
      message: "Roster shift created successfully.",
      shift: result.rows[0],
    });
  } catch (error) {
    console.error("Create roster error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to create the roster shift.",
    });
  }
};

/*
 * UPDATE OWN SHIFT STATUS
 *
 * Care workers can only update their own assigned shift.
 */
export const updateShiftStatus = async (req, res) => {
  try {
    const shiftId = Number(req.params.shiftId);
    const { status } = req.body;

    const allowedStatuses = [
      "IN_PROGRESS",
      "COMPLETED",
    ];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message:
          "Care workers can use IN_PROGRESS or COMPLETED.",
      });
    }

    const result = await pool.query(
      `UPDATE roster_shifts
       SET
          status = $1,
          updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
         AND care_worker_id = $3
       RETURNING *`,
      [status, shiftId, req.user.id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Assigned shift not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Shift status updated successfully.",
      shift: result.rows[0],
    });
  } catch (error) {
    console.error("Update shift status error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to update shift status.",
    });
  }
};