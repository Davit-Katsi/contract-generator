const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const OperatorCaseView = sequelize.define(
  "OperatorCaseView",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },

    operatorId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    caseId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    hasFullAccess: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },

    firstViewedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    lastViewedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: "operator_case_views",
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ["operatorId", "caseId"],
      },
    ],
  }
);

module.exports = OperatorCaseView;