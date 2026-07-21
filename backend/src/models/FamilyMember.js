const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const FamilyMember = sequelize.define(
  "FamilyMember",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },

    familyId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    fullName: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    personalNumber: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    signerType: {
      type: DataTypes.ENUM(
        "self",
        "representative",
        "proxy",
        "supporter",
        "legal_representative"
      ),
      defaultValue: "self",
    },

    representativeFullName: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    representativePersonalNumber: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    tableName: "family_members",
    timestamps: true,
  }
);

module.exports = FamilyMember;