const bcrypt = require("bcryptjs");
const { Op } = require("sequelize");
const { User } = require("../models");

const allowedRoles = ["admin", "manager", "operator", "head"];

const getUsers = async (req, res) => {
  try {
    const users = await User.findAll({
      attributes: [
        "id",
        "fullName",
        "username",
        "role",
        "isActive",
        "authorizedPersonFullName",
        "authorizedPersonPersonalNumber",
        "authorizedPersonPosition",
        "createdAt",
      ],
      order: [["id", "ASC"]],
    });

    return res.json(users);
  } catch (error) {
    console.error("Get users error:", error);
    return res.status(500).json({
      message: "მომხმარებლების სიის მიღების შეცდომა.",
    });
  }
};

const createUser = async (req, res) => {
  try {
    const {
      fullName,
      username,
      password,
      role,
      authorizedPersonFullName,
      authorizedPersonPersonalNumber,
      authorizedPersonPosition,
    } = req.body;

    if (!fullName || !username || !password || !role) {
      return res.status(400).json({
        message: "ყველა სავალდებულო ველი უნდა შეივსოს.",
      });
    }

    const allowedRoles = ["admin", "manager", "operator", "head"];

    if (!allowedRoles.includes(role)) {
      return res.status(400).json({
        message: "მითითებული როლი არასწორია.",
      });
    }

    const existingUser = await User.findOne({
      where: {
        username: username.trim(),
      },
    });

    if (existingUser) {
      return res.status(400).json({
        message: "ასეთი მომხმარებლის სახელი უკვე არსებობს.",
      });
    }

    const hashedPassword = await bcrypt.hash(password.trim(), 10);

    const user = await User.create({
      fullName: fullName.trim(),
      username: username.trim(),
      passwordHash: hashedPassword,
      role,
      isActive: true,
      authorizedPersonFullName: authorizedPersonFullName?.trim() || null,
      authorizedPersonPersonalNumber: authorizedPersonPersonalNumber?.trim() || null,
      authorizedPersonPosition: authorizedPersonPosition?.trim() || null,
    });

    return res.status(201).json({
      message: "მომხმარებელი წარმატებით შეიქმნა.",
      user: {
        id: user.id,
        fullName: user.fullName,
        username: user.username,
        role: user.role,
        isActive: user.isActive,
        authorizedPersonFullName: user.authorizedPersonFullName,
        authorizedPersonPersonalNumber: user.authorizedPersonPersonalNumber,
        authorizedPersonPosition: user.authorizedPersonPosition,
      },
    });
  } catch (error) {
    console.error("Create user error:", error);

    return res.status(500).json({
      message: "მომხმარებლის შექმნა ვერ მოხერხდა.",
    });
  }
};

const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      fullName,
      username,
      password,
      role,
      isActive,
      authorizedPersonFullName,
      authorizedPersonPersonalNumber,
      authorizedPersonPosition,
    } = req.body;

    const user = await User.findByPk(id);

    if (!user) {
      return res.status(404).json({
        message: "მომხმარებელი ვერ მოიძებნა.",
      });
    }

    if (typeof username === "string" && username.trim()) {
      const existingUser = await User.findOne({
        where: {
          username: username.trim(),
          id: {
            [Op.ne]: id,
          },
        },
      });

      if (existingUser) {
        return res.status(400).json({
          message: "ასეთი მომხმარებლის სახელი უკვე არსებობს.",
        });
      }
    }

    const activeAdminCount = await User.count({
      where: {
        role: "admin",
        isActive: true,
      },
    });

    const currentlyActiveAdmin = user.role === "admin" && user.isActive === true;

    const nextRole = role ?? user.role;
    const nextIsActive =
      typeof isActive === "boolean" ? isActive : user.isActive;

    const willBeActiveAdmin = nextRole === "admin" && nextIsActive === true;

    const activeAdminCountAfter =
      activeAdminCount -
      (currentlyActiveAdmin ? 1 : 0) +
      (willBeActiveAdmin ? 1 : 0);

    if (activeAdminCountAfter < 1) {
      return res.status(400).json({
        message: "სისტემაში მინიმუმ ერთი აქტიური ადმინისტრატორი უნდა დარჩეს.",
      });
    }

    if (typeof fullName === "string") {
      user.fullName = fullName.trim();
    }

    if (typeof username === "string" && username.trim()) {
      user.username = username.trim();
    }

    if (typeof password === "string" && password.trim()) {
      user.passwordHash = await bcrypt.hash(password.trim(), 10);
    }

    if (typeof authorizedPersonFullName === "string") {
      user.authorizedPersonFullName = authorizedPersonFullName.trim() || null;
    }

    if (typeof authorizedPersonPersonalNumber === "string") {
      user.authorizedPersonPersonalNumber =
        authorizedPersonPersonalNumber.trim() || null;
    }

    if (typeof authorizedPersonPosition === "string") {
      user.authorizedPersonPosition = authorizedPersonPosition.trim() || null;
    }

    if (role) {
      user.role = role;
    }

    if (typeof isActive === "boolean") {
      user.isActive = isActive;
    }

    await user.save();

    return res.json({
      message: "მომხმარებლის მონაცემები განახლდა.",
      user: {
        id: user.id,
        fullName: user.fullName,
        username: user.username,
        role: user.role,
        isActive: user.isActive,
        authorizedPersonFullName: user.authorizedPersonFullName,
        authorizedPersonPersonalNumber: user.authorizedPersonPersonalNumber,
        authorizedPersonPosition: user.authorizedPersonPosition,
      },
    });
  } catch (error) {
    console.error("Update user error:", error);

    return res.status(500).json({
      message: "მომხმარებლის განახლება ვერ მოხერხდა.",
    });
  }
};

module.exports = {
  getUsers,
  createUser,
  updateUser,
};