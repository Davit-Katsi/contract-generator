const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const Family = sequelize.define(
  "Family",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },

    caseId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    assignedOperatorId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },

    rowNumber: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },

    primaryPersonFullName: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    primaryPersonPersonalNumber: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    beneficiaryPhone: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    protocolInfo: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    administrativePromiseInfo: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    originInfo: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    purchaseAmount: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: true,
    },

    purchaseAmountText: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    currencyMode: {
      type: DataTypes.ENUM("gel_fixed", "usd_equivalent_gel"),
      defaultValue: "gel_fixed",
    },

    isSigned: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },

    signedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },

    cancelledAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    cancellationReason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    tableName: "families",
    timestamps: true,
  }
);

module.exports = Family;