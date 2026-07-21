const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const Seller = sequelize.define(
  "Seller",
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

    phone: {
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

    bankName: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    bankCode: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    bankAccount: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    bankRecipient: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    tableName: "sellers",
    timestamps: true,
  }
);

module.exports = Seller;