import pool from "../config/database.js";

/*
 * GET ALL CARE WORKERS
 * GET /api/workers
 *
 * Admin only.
 */
export const getWorkers = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
          id,
          profile_image,
          full_name,
          email,
          phone,
          address,
          emergency_contact_name,
          emergency_contact_phone,
          employment_status,
          joined_date,
          is_active,
          created_at
       FROM users
       WHERE role = 'CARE_WORKER'
       ORDER BY full_name ASC`,
    );

    return res.status(200).json({
      success: true,
      count: result.rows.length,
      workers: result.rows,
    });
  } catch (error) {
    console.error("Get workers error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve workers.",
    });
  }
};

/*
 * GET ONE CARE WORKER
 * GET /api/workers/:workerId
 *
 * Admin only.
 */
export const getWorkerById = async (req, res) => {
  try {
    const workerId = Number(req.params.workerId);

    if (!Number.isInteger(workerId) || workerId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid worker ID.",
      });
    }

    const result = await pool.query(
      `SELECT
          id,
          profile_image,
          full_name,
          email,
          phone,
          address,
          emergency_contact_name,
          emergency_contact_phone,
          employment_status,
          joined_date,
          is_active,
          created_at
       FROM users
       WHERE id = $1
         AND role = 'CARE_WORKER'`,
      [workerId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Worker not found.",
      });
    }

    return res.status(200).json({
      success: true,
      worker: result.rows[0],
    });
  } catch (error) {
    console.error("Get worker error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve the worker.",
    });
  }
};

/*
 * UPDATE CARE WORKER
 * PATCH /api/workers/:workerId
 *
 * Email is deliberately not updated.
 */
export const updateWorker = async (req, res) => {
  try {
    const workerId = Number(req.params.workerId);

    const {
      fullName,
      phone,
      address,
      emergencyContactName,
      emergencyContactPhone,
      employmentStatus,
      joinedDate,
      isActive,
    } = req.body;

    const allowedStatuses = [
      "CASUAL",
      "PART_TIME",
      "FULL_TIME",
    ];

    if (
      employmentStatus !== undefined &&
      !allowedStatuses.includes(employmentStatus)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Employment status must be CASUAL, PART_TIME or FULL_TIME.",
      });
    }

    const result = await pool.query(
      `UPDATE users
       SET
          full_name = COALESCE($1, full_name),
          phone = COALESCE($2, phone),
          address = COALESCE($3, address),
          emergency_contact_name =
              COALESCE($4, emergency_contact_name),
          emergency_contact_phone =
              COALESCE($5, emergency_contact_phone),
          employment_status =
              COALESCE($6, employment_status),
          joined_date =
              COALESCE($7::date, joined_date),
          is_active =
              COALESCE($8, is_active)
       WHERE id = $9
         AND role = 'CARE_WORKER'
       RETURNING
          id,
          full_name,
          email,
          phone,
          address,
          emergency_contact_name,
          emergency_contact_phone,
          employment_status,
          joined_date,
          is_active`,
      [
        fullName ?? null,
        phone ?? null,
        address ?? null,
        emergencyContactName ?? null,
        emergencyContactPhone ?? null,
        employmentStatus ?? null,
        joinedDate || null,
        typeof isActive === "boolean" ? isActive : null,
        workerId,
      ],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Worker not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Worker updated successfully.",
      worker: result.rows[0],
    });
  } catch (error) {
    console.error("Update worker error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to update the worker.",
    });
  }
};


/*
 * SOFT DELETE CARE WORKER
 * DELETE /api/workers/:workerId
 *
 * This will:
 * 1. Deactivate the worker's account.
 * 2. End their active client assignments.
 * 3. Cancel their future scheduled shifts.
 */
export const deleteWorker = async (req, res) => {
  const workerId = Number(req.params.workerId);

  if (!Number.isInteger(workerId) || workerId <= 0) {
    return res.status(400).json({
      success: false,
      message: "Invalid worker ID.",
    });
  }

  // Use one database connection for the transaction.
  const databaseClient = await pool.connect();

  try {
    await databaseClient.query("BEGIN");

    // Deactivate only a CARE_WORKER account.
    // An administrator cannot be deleted through this endpoint.
    const workerResult = await databaseClient.query(
      `UPDATE users
       SET is_active = FALSE
       WHERE id = $1
         AND role = 'CARE_WORKER'
         AND is_active = TRUE
       RETURNING id, full_name, email`,
      [workerId],
    );

    if (workerResult.rows.length === 0) {
      await databaseClient.query("ROLLBACK");

      return res.status(404).json({
        success: false,
        message: "Active care worker not found.",
      });
    }

    // End all active client assignments for this worker.
    await databaseClient.query(
      `UPDATE client_assignments
       SET
          is_active = FALSE,
          ended_at = CURRENT_TIMESTAMP
       WHERE care_worker_id = $1
         AND is_active = TRUE`,
      [workerId],
    );

    // Cancel this worker's future scheduled shifts.
    await databaseClient.query(
      `UPDATE roster_shifts
       SET
          status = 'CANCELLED',
          updated_at = CURRENT_TIMESTAMP
       WHERE care_worker_id = $1
         AND shift_start > CURRENT_TIMESTAMP
         AND status = 'SCHEDULED'`,
      [workerId],
    );

    await databaseClient.query("COMMIT");

    return res.status(200).json({
      success: true,
      message: "Care worker deleted successfully.",
      worker: workerResult.rows[0],
    });
  } catch (error) {
    await databaseClient.query("ROLLBACK");

    console.error("Delete worker error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to delete the care worker.",
    });
  } finally {
    databaseClient.release();
  }
};