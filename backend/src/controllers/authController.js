const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { User } = require("../models");

const login = async (req, res) => {
  try {
    const { username, password } = req.body || {};

    if (!username || !password) {
      return res.status(400).json({
        message: "მომხმარებლის სახელი და პაროლი აუცილებელია.",
      });
    }

    const user = await User.findOne({
      where: {
        username: username.trim(),
      },
    });

    if (!user || !user.isActive) {
      return res.status(401).json({
        message: "მომხმარებელი ვერ მოიძებნა ან დეაქტივირებულია.",
      });
    }

    const isPasswordValid = await bcrypt.compare(
      password.trim(),
      user.passwordHash
    );

    if (!isPasswordValid) {
      return res.status(401).json({
        message: "არასწორი მომხმარებელი ან პაროლი.",
      });
    }

    const token = jwt.sign(
      {
        id: user.id,
        role: user.role,
        username: user.username,
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "1d" }
    );

    return res.json({
      token,
      user: {
        id: user.id,
        fullName: user.fullName,
        username: user.username,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({
      message: "სერვერის შეცდომა ავტორიზაციის დროს.",
    });
  }
};

module.exports = {
  login,
};