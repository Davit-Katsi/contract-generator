const jwt = require("jsonwebtoken");
const { User } = require("../models");

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        message: "ავტორიზაცია საჭიროა.",
      });
    }

    const token = authHeader.split(" ")[1];

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findByPk(decoded.id, {
      attributes: ["id", "fullName", "username", "role", "isActive"],
    });

    if (!user || !user.isActive) {
      return res.status(401).json({
        message: "მომხმარებელი ვერ მოიძებნა ან დეაქტივირებულია.",
      });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    return res.status(401).json({
      message: "არასწორი ან ვადაგასული token.",
    });
  }
};

const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        message: "ამ მოქმედებისთვის არ გაქვთ უფლება.",
      });
    }

    next();
  };
};

module.exports = {
  authMiddleware,
  requireRole,
};