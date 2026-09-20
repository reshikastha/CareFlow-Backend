import jwt from "jsonwebtoken";
import pool from "../config/database.js";

/*
 * authenticateUser()
 *
 * This middleware:
 * 1. Reads the JWT from the Authorization header.
 * 2. Verifies that the token is valid.
 * 3. Gets the latest user and role from PostgreSQL.
 * 4. Places the user information in req.user.
 */
export const authenticateUser = async (req, res, next) => {
  // The header should look like:
  // Authorization: Bearer eyJhbGciOi...
  const authorizationHeader = req.headers.authorization;

  // Check whether the Authorization header exists.
  if (
    !authorizationHeader ||
    !authorizationHeader.startsWith("Bearer ")
  ) {
    return res.status(401).json({
      success: false,
      message: "Authentication token is required.",
    });
  }

  // Remove "Bearer " and keep only the token.
  const token = authorizationHeader.split(" ")[1];

  // Ensure the JWT secret exists.
  if (!process.env.JWT_SECRET) {
    console.error("JWT_SECRET is missing from the .env file.");

    return res.status(500).json({
      success: false,
      message: "Server authentication is not configured.",
    });
  }

  let decodedToken;

  try {
    // Verify the token signature and expiration.
    decodedToken = jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    // Give a clearer message when the token has expired.
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Your session has expired. Please log in again.",
      });
    }

    return res.status(401).json({
      success: false,
      message: "Invalid authentication token.",
    });
  }

  try {
    // Read the user from PostgreSQL.
    // Getting the role from the database means permission changes
    // take effect without requiring a new token.
    const result = await pool.query(
      `SELECT id, full_name, email, role
       FROM users
       WHERE id = $1`,
      [decodedToken.userId],
    );

    // The user may have been deleted after the token was created.
    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: "The user account no longer exists.",
      });
    }

    // Make the authenticated user available to later middleware
    // and controllers.
    req.user = {
      id: result.rows[0].id,
      fullName: result.rows[0].full_name,
      email: result.rows[0].email,
      role: result.rows[0].role,
    };

    // Continue to the next middleware or controller.
    next();
  } catch (error) {
    console.error("Authentication database error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to authenticate the user.",
    });
  }
};

/*
 * authorizeRoles(...allowedRoles)
 *
 * Examples:
 * authorizeRoles("ADMIN")
 * authorizeRoles("ADMIN", "CARE_WORKER")
 */
export const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    // authenticateUser() must run before authorizeRoles().
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "You must log in before accessing this resource.",
      });
    }

    // Check whether the user's role is in the allowed role list.
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to access this resource.",
      });
    }

    // The user has permission, so continue to the controller.
    next();
  };
};