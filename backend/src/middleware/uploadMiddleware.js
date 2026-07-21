const multer = require("multer");
const path = require("path");
const fs = require("fs");

const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, "../../uploads/cases");
    ensureDir(dir);
    cb(null, dir);
  },

  filename: (req, file, cb) => {
    const safeOriginalName = file.originalname.replace(/\s+/g, "_");
    const uniqueName = `${Date.now()}-${Math.round(
      Math.random() * 1e9
    )}-${safeOriginalName}`;

    cb(null, uniqueName);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
  ];

  if (!allowedMimeTypes.includes(file.mimetype)) {
    return cb(new Error("დაშვებულია მხოლოდ PDF და Excel ფაილები."), false);
  }

  cb(null, true);
};

const uploadCaseFiles = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50 MB
  },
}).fields([
  { name: "orderPdf", maxCount: 1 },
  { name: "annexExcel", maxCount: 1 },
]);

const safeDeleteFile = async (filePath) => {
  if (!filePath) return;

  try {
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
    }
  } catch (error) {
    console.warn("Upload cleanup warning:", filePath, error.message);
  }
};

const cleanupUploadedFilesFromRequest = async (req) => {
  const filePaths = [];

  if (req.file?.path) {
    filePaths.push(req.file.path);
  }

  if (req.files) {
    Object.values(req.files)
      .flat()
      .forEach((file) => {
        if (file?.path) {
          filePaths.push(file.path);
        }
      });
  }

  await Promise.all(filePaths.map((filePath) => safeDeleteFile(filePath)));
};

const handleCaseUpload = (req, res, next) => {
  uploadCaseFiles(req, res, async (error) => {
    if (!error) {
      return next();
    }

    await cleanupUploadedFilesFromRequest(req);

    if (error instanceof multer.MulterError) {
      if (error.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({
          message:
            "ატვირთული ფაილი ძალიან დიდია. დასაშვები მაქსიმალური ზომაა 50MB.",
        });
      }

      if (error.code === "LIMIT_UNEXPECTED_FILE") {
        return res.status(400).json({
          message:
            "არასწორი ფაილის ველი. ატვირთეთ ბრძანების PDF და დანართის Excel ფაილი.",
        });
      }

      return res.status(400).json({
        message: `ფაილის ატვირთვის შეცდომა: ${error.message}`,
      });
    }

    return res.status(400).json({
      message: error.message || "ფაილის ატვირთვის შეცდომა.",
    });
  });
};

module.exports = {
  uploadCaseFiles,
  handleCaseUpload,
};