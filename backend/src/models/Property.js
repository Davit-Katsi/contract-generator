const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const Property = sequelize.define(
  "Property",
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

    address: {
      type: DataTypes.TEXT,
      allowNull: false,
    },

    cadastralCode: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    floor: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    apartmentNumber: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    area: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    buildingInfo: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    damagedPropertyCadastralCode: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    tableName: "properties",
    timestamps: true,
  }
);

module.exports = Property;