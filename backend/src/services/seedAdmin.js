const bcrypt = require("bcryptjs");
const { User } = require("../models");

const seedAdmin = async () => {
  const username = process.env.ADMIN_USERNAME || "admin";
  const password = process.env.ADMIN_PASSWORD || "admin123";

  const existingAdmin = await User.findOne({ where: { username } });

  if (existingAdmin) {
    console.log("Admin user already exists.");
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);

  await User.create({
    fullName: "სისტემის ადმინისტრატორი",
    username,
    passwordHash,
    role: "admin",
    isActive: true,
  });

  console.log("Admin user created.");
};

module.exports = seedAdmin;