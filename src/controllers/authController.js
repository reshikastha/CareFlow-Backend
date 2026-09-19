import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import pool from "../config/database.js";

// Number of hashing rounds bcrypt will use.
const SALT_ROUNDS = 12;

/*
 * Register a new user
 * Route: POST /api/auth/register
 */
export const registerUser = async (req, res) => {
  try {
    // Get registration values sent by the frontend.
    const { fullName, email, password, confirmPassword } = req.body;

    // Check that every required field has been provided.
    if (!fullName || !email || !password || !confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "All fields are required.",
      });
    }

    // Remove unwanted spaces and make the email lowercase.
    const cleanedFullName = fullName.trim();
    const cleanedEmail = email.trim().toLowerCase();

    // Validate the user's full name.
    if (cleanedFullName.length < 2) {
      return res.status(400).json({
        success: false,
        message: "Full name must contain at least 2 characters.",
      });
    }

    // Basic email validation.
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailPattern.test(cleanedEmail)) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid email address.",
      });
    }

    // Require a reasonably strong password length.
    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must contain at least 8 characters.",
      });
    }

    // Make sure the password and confirmation match.
    if (password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Passwords do not match.",
      });
    }

    // Check whether the email is already registered.
    // $1 is a parameter placeholder that helps prevent SQL injection.
    const existingUser = await pool.query(
      "SELECT id FROM users WHERE email = $1",
      [cleanedEmail],
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists.",
      });
    }

    // Hash the password before saving it.
    // The original password is never stored.
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    // Save the user in PostgreSQL.
    // RETURNING gives us the new user without returning the password hash.
    const result = await pool.query(
      `INSERT INTO users (full_name, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, full_name, email, created_at`,
      [cleanedFullName, cleanedEmail, passwordHash],
    );

    const newUser = result.rows[0];

    // Return the created user.
    return res.status(201).json({
      success: true,
      message: "Registration successful.",
      user: {
        id: newUser.id,
        fullName: newUser.full_name,
        email: newUser.email,
        createdAt: newUser.created_at,
      },
    });
  } catch (error) {
    console.error("Registration error:", error);

    // PostgreSQL error code 23505 means a unique value already exists.
    // This also protects against simultaneous duplicate registrations.
    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Unable to register the user.",
    });
  }
};

/*
 * Log in an existing user
 * Route: POST /api/auth/login
 */
export const loginUser = async (req, res) => {
  try {
    // Get login values sent by the frontend.
    const { email, password } = req.body;

    // Check that both fields were provided.
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required.",
      });
    }

    // Normalise the email before searching the database.
    const cleanedEmail = email.trim().toLowerCase();

    // Find the user by email.
    // The password hash is required here so bcrypt can compare it.
    const result = await pool.query(
      `SELECT id, full_name, email, password_hash
       FROM users
       WHERE email = $1`,
      [cleanedEmail],
    );

    // Use one general message for an incorrect email or password.
    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    const user = result.rows[0];

    // Compare the entered password with the saved password hash.
    const passwordIsCorrect = await bcrypt.compare(
      password,
      user.password_hash,
    );

    if (!passwordIsCorrect) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    // Create a signed login token containing the user's ID.
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: process.env.JWT_EXPIRES_IN || "7d",
      },
    );

    // Return the token and safe user information.
    // Never return password_hash.
    return res.status(200).json({
      success: true,
      message: "Login successful.",
      token,
      user: {
        id: user.id,
        fullName: user.full_name,
        email: user.email,
      },
    });
  } catch (error) {
    console.error("Login error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to log in.",
    });
  }
};