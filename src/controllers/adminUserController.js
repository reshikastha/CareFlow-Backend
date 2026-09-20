import pool from "../config/database.js";

/*
 * Only an admin can update employment status and joined date.
 */
export const updateEmploymentDetails = async (
  req,
  res,
) => {
  try {
    const userId = Number(req.params.userId);
    const { employmentStatus, joinedDate } = req.body;

    const allowedStatuses = [
      "CASUAL",
      "PART_TIME",
      "FULL_TIME",
    ];

    if (!allowedStatuses.includes(employmentStatus)) {
      return res.status(400).json({
        success: false,
        message:
          "Status must be CASUAL, PART_TIME or FULL_TIME.",
      });
    }

    if (!joinedDate) {
      return res.status(400).json({
        success: false,
        message: "Joined date is required.",
      });
    }

    const result = await pool.query(
      `UPDATE users
       SET
          employment_status = $1,
          joined_date = $2
       WHERE id = $3
       RETURNING
          id,
          full_name,
          employment_status,
          joined_date`,
      [employmentStatus, joinedDate, userId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Employment details updated successfully.",
      user: result.rows[0],
    });
  } catch (error) {
    console.error("Employment update error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to update employment details.",
    });
  }
};