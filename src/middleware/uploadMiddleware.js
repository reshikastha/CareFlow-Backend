import multer from "multer";
import path from "path";
import crypto from "crypto";
import fs from "fs";

/*
 * PROFILE IMAGE UPLOAD
 */

const profileImageDirectory = path.join(
  process.cwd(),
  "uploads",
  "profiles",
);

// Create the profile-image directory if it does not exist.
fs.mkdirSync(profileImageDirectory, {
  recursive: true,
});

const profileImageStorage = multer.diskStorage({
  destination: (req, file, callback) => {
    callback(null, profileImageDirectory);
  },

  filename: (req, file, callback) => {
    const extensions = {
      "image/jpeg": ".jpg",
      "image/png": ".png",
      "image/webp": ".webp",
    };

    // Generate a safe and unique filename.
    callback(
      null,
      `${crypto.randomUUID()}${extensions[file.mimetype]}`,
    );
  },
});

const profileImageUpload = multer({
  storage: profileImageStorage,

  limits: {
    fileSize: 5 * 1024 * 1024,
  },

  fileFilter: (req, file, callback) => {
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
    ];

    if (!allowedTypes.includes(file.mimetype)) {
      return callback(
        new Error("Profile image must be JPG, PNG or WebP."),
      );
    }

    callback(null, true);
  },
});

// Process one profile image using the field name "image".
export const uploadProfileImage = (req, res, next) => {
  profileImageUpload.single("image")(req, res, (error) => {
    if (error) {
      return res.status(400).json({
        success: false,
        message:
          error.code === "LIMIT_FILE_SIZE"
            ? "Profile image must be smaller than 5 MB."
            : error.message,
      });
    }

    next();
  });
};

/*
 * COMPLIANCE DOCUMENT UPLOAD
 */

const complianceDirectory = path.join(
  process.cwd(),
  "uploads",
  "compliance",
);

// Create the compliance directory if it does not exist.
fs.mkdirSync(complianceDirectory, {
  recursive: true,
});

const complianceStorage = multer.diskStorage({
  destination: (req, file, callback) => {
    callback(null, complianceDirectory);
  },

  filename: (req, file, callback) => {
    const extensions = {
      "application/pdf": ".pdf",
      "image/jpeg": ".jpg",
      "image/png": ".png",
    };

    callback(
      null,
      `${crypto.randomUUID()}${extensions[file.mimetype]}`,
    );
  },
});

const complianceUpload = multer({
  storage: complianceStorage,

  limits: {
    // Maximum size for each document: 10 MB.
    fileSize: 10 * 1024 * 1024,

    // Maximum number of documents in one request.
    files: 10,
  },

  fileFilter: (req, file, callback) => {
    const allowedTypes = [
      "application/pdf",
      "image/jpeg",
      "image/png",
    ];

    if (!allowedTypes.includes(file.mimetype)) {
      return callback(
        new Error(
          "Compliance documents must be PDF, JPG or PNG.",
        ),
      );
    }

    callback(null, true);
  },
});

// Process multiple files using the field name "documents".
export const uploadComplianceDocuments = (
  req,
  res,
  next,
) => {
  complianceUpload.array("documents", 10)(
    req,
    res,
    (error) => {
      if (error) {
        return res.status(400).json({
          success: false,
          message:
            error.code === "LIMIT_FILE_SIZE"
              ? "Each document must be smaller than 10 MB."
              : error.message,
        });
      }

      next();
    },
  );
};