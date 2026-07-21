const express = require("express");
const {
  getUsers,
  createUser,
  updateUser,
} = require("../controllers/adminController");

const { authMiddleware, requireRole } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(authMiddleware);
router.use(requireRole("admin"));

router.get("/users", getUsers);
router.post("/users", createUser);
router.patch("/users/:id", updateUser);

module.exports = router;