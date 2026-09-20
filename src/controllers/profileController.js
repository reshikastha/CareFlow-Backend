import pool from "../config/database.js";

/*
 * Convert a PostgreSQL user row into a frontend-friendly object.
 *
 * Email is included for display but cannot be updated through
 * the profile-update endpoint.
 */
const formatProfile = (user, documents, req) => {
  const imageUrl = user.profile_image
    ? `${req.protocol}://${req.get("host")}${user.profile_image}`
    : null;

  return {
    id: user.id,
    image: imageUrl,
    fullName: user.full_name,
    phone: user.phone,

    // Email is read-only.
    email: user.email,

    address: user.address,
    emergencyContact: {
      name: user.emergency_contact_name,
      phone: user.emergency_contact_phone,
    },

    employmentStatus: user.employment_status,
    joinedDate: user.joined_date,
    role: user.role,

    complianceDocuments: documents.map((document) => ({
      id: document.id,
      name: document.original_name,
      url: `${req.protocol}://${req.get("host")}${document.document_url}`,
      mimeType: document.mime_type,
      verificationStatus: document.verification_status,
      uploadedAt: document.uploaded_at,
    })),
  };
};

/*
 * GET PROFILE
 * GET /api/profile
 */
export const getProfile = async (req, res) => {
  try {
    // Get the logged-in user's profile.
    const userResult = await pool.query(
      `SELECT
          id,
          profile_image,
          full_name,
          phone,
          email,
          address,
          emergency_contact_name,
          emergency_contact_phone,
          employment_status,
          joined_date,
          role
       FROM users
       WHERE id = $1`,
      [req.user.id],
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Profile not found.",
      });
    }

    // Get all compliance documents belonging to this user.
    const documentResult = await pool.query(
      `SELECT
          id,
          original_name,
          document_url,
          mime_type,
          verification_status,
          uploaded_at
       FROM compliance_documents
       WHERE user_id = $1
       ORDER BY uploaded_at DESC`,
      [req.user.id],
    );

    return res.status(200).json({
      success: true,
      profile: formatProfile(
        userResult.rows[0],
        documentResult.rows,
        req,
      ),
    });
  } catch (error) {
    console.error("Get profile error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve your profile.",
    });
  }
};

/*
 * UPDATE PERSONAL PROFILE
 * PATCH /api/profile
 *
 * The user can update:
 * - Image
 * - Full name
 * - Phone
 * - Address
 * - Emergency-contact information
 *
 * The user cannot update:
 * - Email
 * - Role
 * - Employment status
 * - Joined date
 */
export const updateProfile = async (req, res) => {
  try {
    const {
      fullName,
      phone,
      address,
      emergencyContactName,
      emergencyContactPhone,
    } = req.body;

    // Validate the full name when it is provided.
    if (
      fullName !== undefined &&
      fullName.trim().length < 2
    ) {
      return res.status(400).json({
        success: false,
        message: "Full name must contain at least 2 characters.",
      });
    }

    // Create the image URL path if a new image was uploaded.
    const profileImagePath = req.file
      ? `/uploads/profiles/${req.file.filename}`
      : null;

    /*
     * Email is deliberately not included in this SQL query.
     * Any email sent from the frontend will be ignored.
     */
    const result = await pool.query(
      `UPDATE users
       SET
          profile_image = COALESCE($1, profile_image),
          full_name = COALESCE($2, full_name),
          phone = COALESCE($3, phone),
          address = COALESCE($4, address),
          emergency_contact_name =
              COALESCE($5, emergency_contact_name),
          emergency_contact_phone =
              COALESCE($6, emergency_contact_phone)
       WHERE id = $7
       RETURNING id`,
      [
        profileImagePath,
        fullName !== undefined ? fullName.trim() : null,
        phone !== undefined ? phone.trim() : null,
        address !== undefined ? address.trim() : null,
        emergencyContactName !== undefined
          ? emergencyContactName.trim()
          : null,
        emergencyContactPhone !== undefined
          ? emergencyContactPhone.trim()
          : null,
        req.user.id,
      ],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Profile not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully.",
    });
  } catch (error) {
    console.error("Update profile error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to update your profile.",
    });
  }
};

/*
 * UPLOAD COMPLIANCE DOCUMENTS
 * POST /api/profile/compliance-documents
 */
export const addComplianceDocuments = async (
  req,
  res,
) => {
  try {
    // Multer places uploaded files in req.files.
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Please select at least one document.",
      });
    }

    const savedDocuments = [];

    /*
     * Save information about each uploaded file.
     * The physical file is stored in uploads/compliance.
     */
    for (const file of req.files) {
      const documentUrl = `/uploads/compliance/${file.filename}`;

      const result = await pool.query(
        `INSERT INTO compliance_documents (
            user_id,
            original_name,
            document_url,
            mime_type
         )
         VALUES ($1, $2, $3, $4)
         RETURNING
            id,
            original_name,
            document_url,
            mime_type,
            verification_status,
            uploaded_at`,
        [
          req.user.id,
          file.originalname,
          documentUrl,
          file.mimetype,
        ],
      );

      savedDocuments.push(result.rows[0]);
    }

    return res.status(201).json({
      success: true,
      message: "Compliance documents uploaded successfully.",
      documents: savedDocuments.map((document) => ({
        id: document.id,
        name: document.original_name,
        url: `${req.protocol}://${req.get("host")}${document.document_url}`,
        mimeType: document.mime_type,
        verificationStatus: document.verification_status,
        uploadedAt: document.uploaded_at,
      })),
    });
  } catch (error) {
    console.error("Compliance upload error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to save compliance documents.",
    });
  }
};