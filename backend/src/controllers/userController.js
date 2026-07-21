const { User } = require("../models");

const getActiveOperators = async (req, res) => {
  try {
    const operators = await User.findAll({
      where: {
        role: "operator",
        isActive: true,
      },
      attributes: ["id", "fullName", "username"],
      order: [["fullName", "ASC"]],
    });

    return res.json(operators);
  } catch (error) {
    console.error("Get active operators error:", error);
    return res.status(500).json({
      message: "ოპერატორების სიის მიღების შეცდომა.",
    });
  }
};

module.exports = {
  getActiveOperators,
};