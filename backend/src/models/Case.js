const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const Case = sequelize.define(
  "Case",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },

    title: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    orderNumber: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    orderDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },

    mainCategory: {
      type: DataTypes.ENUM("idps", "ecomigrants", "homeless"),
      allowNull: false,
    },

    subCategory: {
      type: DataTypes.ENUM(
        "idps_rural_house",
        "idps_admin_promise_purchase",
        "idps_legalization_lawful_possession",
        "idps_legalization_housing_rule",
        "ecomigrant_purchase",
        "ecomigrant_legalization",
        "homeless_purchase"
      ),
      allowNull: false,
    },

    authorizedPersonFullName: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    authorizedPersonPersonalNumber: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    authorizedPersonPosition: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    orderPdfPath: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    annexExcelPath: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    isClosed: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },

    closedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    purgeAfter: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    filesPurgedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    filesPurgeReason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    isCancelled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },

    cancelledAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    cancelledById: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  },
  {
    tableName: "cases",
    timestamps: true,
  }
);

module.exports = Case;