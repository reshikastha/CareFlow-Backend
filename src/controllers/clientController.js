import pool from "../config/database.js";

/*
 * GET CLIENTS
 *
 * Admin: receives every active client.
 * Care worker: receives only assigned clients.
 */
export const getClients = async (req, res) => {
  try {
    let result;

    if (req.user.role === "ADMIN") {
      result = await pool.query(
        `SELECT *
         FROM clients
         WHERE is_active = TRUE
         ORDER BY full_name ASC`,
      );
    } else {
      result = await pool.query(
        `SELECT
            c.*,
            ca.assigned_at
         FROM clients AS c
         INNER JOIN client_assignments AS ca
            ON ca.client_id = c.id
         WHERE ca.care_worker_id = $1
           AND ca.is_active = TRUE
           AND c.is_active = TRUE
         ORDER BY c.full_name ASC`,
        [req.user.id],
      );
    }

    return res.status(200).json({
      success: true,
      count: result.rows.length,
      clients: result.rows,
    });
  } catch (error) {
    console.error("Get clients error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve clients.",
    });
  }
};

/*
 * CREATE CLIENT
 * Admin only.
 */
export const createClient = async (req, res) => {
  try {
    const {
      fullName,
      dateOfBirth,
      phone,
      email,
      address,
      emergencyContactName,
      emergencyContactPhone,
      careNotes,
    } = req.body;

    if (!fullName) {
      return res.status(400).json({
        success: false,
        message: "Client full name is required.",
      });
    }

    const result = await pool.query(
      `INSERT INTO clients (
          full_name,
          date_of_birth,
          phone,
          email,
          address,
          emergency_contact_name,
          emergency_contact_phone,
          care_notes,
          created_by
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        fullName.trim(),
        dateOfBirth || null,
        phone || null,
        email?.trim().toLowerCase() || null,
        address || null,
        emergencyContactName || null,
        emergencyContactPhone || null,
        careNotes || null,
        req.user.id,
      ],
    );

    return res.status(201).json({
      success: true,
      message: "Client created successfully.",
      client: result.rows[0],
    });
  } catch (error) {
    console.error("Create client error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to create the client.",
    });
  }
};

/*
 * UPDATE CLIENT
 * Admin only.
 */
export const updateClient = async (req, res) => {
  try {
    const clientId = Number(req.params.clientId);

    const {
      fullName,
      dateOfBirth,
      phone,
      email,
      address,
      emergencyContactName,
      emergencyContactPhone,
      careNotes,
      isActive,
    } = req.body;

    const result = await pool.query(
      `UPDATE clients
       SET
          full_name = COALESCE($1, full_name),
          date_of_birth = COALESCE($2::date, date_of_birth),
          phone = COALESCE($3, phone),
          email = COALESCE($4, email),
          address = COALESCE($5, address),
          emergency_contact_name =
              COALESCE($6, emergency_contact_name),
          emergency_contact_phone =
              COALESCE($7, emergency_contact_phone),
          care_notes = COALESCE($8, care_notes),
          is_active = COALESCE($9, is_active),
          updated_at = CURRENT_TIMESTAMP
       WHERE id = $10
       RETURNING *`,
      [
        fullName ?? null,
        dateOfBirth || null,
        phone ?? null,
        email?.trim().toLowerCase() || null,
        address ?? null,
        emergencyContactName ?? null,
        emergencyContactPhone ?? null,
        careNotes ?? null,
        typeof isActive === "boolean" ? isActive : null,
        clientId,
      ],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Client not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Client updated successfully.",
      client: result.rows[0],
    });
  } catch (error) {
    console.error("Update client error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to update the client.",
    });
  }
};

/*
 * ASSIGN CLIENT TO CARE WORKER
 * Admin only.
 */
export const assignClient = async (req, res) => {
  try {
    const clientId = Number(req.params.clientId);
    const { careWorkerId } = req.body;

    // Confirm that the selected user is an active care worker.
    const workerResult = await pool.query(
      `SELECT id
       FROM users
       WHERE id = $1
         AND role = 'CARE_WORKER'
         AND is_active = TRUE`,
      [careWorkerId],
    );

    if (workerResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Active care worker not found.",
      });
    }

    const result = await pool.query(
      `INSERT INTO client_assignments (
          client_id,
          care_worker_id,
          assigned_by
       )
       VALUES ($1, $2, $3)
       RETURNING *`,
      [clientId, careWorkerId, req.user.id],
    );

    return res.status(201).json({
      success: true,
      message: "Client assigned successfully.",
      assignment: result.rows[0],
    });
  } catch (error) {
    console.error("Assign client error:", error);

    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        message:
          "This client is already assigned to this worker.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Unable to assign the client.",
    });
  }
};


/*
 * SOFT DELETE CLIENT
 * DELETE /api/clients/:clientId
 *
 * This will:
 * 1. Make the client inactive.
 * 2. End their active worker assignments.
 * 3. Cancel their future scheduled shifts.
 */
export const deleteClient = async (req, res) => {
  const clientId = Number(req.params.clientId);

  if (!Number.isInteger(clientId) || clientId <= 0) {
    return res.status(400).json({
      success: false,
      message: "Invalid client ID.",
    });
  }

  // Get one connection for the entire transaction.
  const databaseClient = await pool.connect();

  try {
    await databaseClient.query("BEGIN");

    // Mark the client as inactive instead of permanently deleting them.
    const clientResult = await databaseClient.query(
      `UPDATE clients
       SET
          is_active = FALSE,
          updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
         AND is_active = TRUE
       RETURNING id, full_name`,
      [clientId],
    );

    if (clientResult.rows.length === 0) {
      await databaseClient.query("ROLLBACK");

      return res.status(404).json({
        success: false,
        message: "Active client not found.",
      });
    }

    // End every active assignment for this client.
    await databaseClient.query(
      `UPDATE client_assignments
       SET
          is_active = FALSE,
          ended_at = CURRENT_TIMESTAMP
       WHERE client_id = $1
         AND is_active = TRUE`,
      [clientId],
    );

    // Cancel future shifts belonging to this client.
    await databaseClient.query(
      `UPDATE roster_shifts
       SET
          status = 'CANCELLED',
          updated_at = CURRENT_TIMESTAMP
       WHERE client_id = $1
         AND shift_start > CURRENT_TIMESTAMP
         AND status = 'SCHEDULED'`,
      [clientId],
    );

    await databaseClient.query("COMMIT");

    return res.status(200).json({
      success: true,
      message: "Client deleted successfully.",
      client: clientResult.rows[0],
    });
  } catch (error) {
    await databaseClient.query("ROLLBACK");

    console.error("Delete client error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to delete the client.",
    });
  } finally {
    // Return the connection to the PostgreSQL pool.
    databaseClient.release();
  }
};