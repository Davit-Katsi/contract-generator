const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const ContractData = sequelize.define(
  "ContractData",
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

    contractNumber: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    contractDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },

    generatedDocxPath: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    generatedPdfPath: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    generatedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    extraData: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
  },
  {
    tableName: "contract_data",
    timestamps: true,
  }
);

module.exports = ContractData;