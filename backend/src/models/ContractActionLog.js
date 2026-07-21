const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const ContractActionLog = sequelize.define(
  "ContractActionLog",
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

    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    action: {
      type: DataTypes.ENUM(
        "created",
        "generated",
        "signed",
        "cancelled",
        "reactivated",
        "downloaded"
      ),
      allowNull: false,
    },

    comment: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    tableName: "contract_action_logs",
    timestamps: true,
  }
);

module.exports = ContractActionLog;