const sequelize = require("../config/database");

const User = require("./User");
const Case = require("./Case");
const Family = require("./Family");
const FamilyMember = require("./FamilyMember");
const Seller = require("./Seller");
const Property = require("./Property");
const ContractData = require("./ContractData");
const ContractActionLog = require("./ContractActionLog");
const OperatorCaseView = require("./OperatorCaseView");

User.hasMany(Case, { foreignKey: "createdById", as: "createdCases" });
Case.belongsTo(User, { foreignKey: "createdById", as: "createdBy" });

Case.hasMany(Family, { foreignKey: "caseId", as: "families" });
Family.belongsTo(Case, { foreignKey: "caseId", as: "case" });

User.hasMany(Family, {
  foreignKey: "assignedOperatorId",
  as: "assignedFamilies",
});
Family.belongsTo(User, {
  foreignKey: "assignedOperatorId",
  as: "assignedOperator",
});

Family.hasMany(FamilyMember, { foreignKey: "familyId", as: "members" });
FamilyMember.belongsTo(Family, { foreignKey: "familyId", as: "family" });

Family.hasOne(Seller, { foreignKey: "familyId", as: "seller" });
Family.hasMany(Seller, { foreignKey: "familyId", as: "sellers" });
Seller.belongsTo(Family, { foreignKey: "familyId", as: "family" });

Family.hasOne(Property, { foreignKey: "familyId", as: "property" });
Property.belongsTo(Family, { foreignKey: "familyId", as: "family" });

Family.hasOne(ContractData, { foreignKey: "familyId", as: "contractData" });
ContractData.belongsTo(Family, { foreignKey: "familyId", as: "family" });

Family.hasMany(ContractActionLog, { foreignKey: "familyId", as: "logs" });
ContractActionLog.belongsTo(Family, { foreignKey: "familyId", as: "family" });

User.hasMany(ContractActionLog, { foreignKey: "userId", as: "contractLogs" });
ContractActionLog.belongsTo(User, { foreignKey: "userId", as: "user" });

User.hasMany(OperatorCaseView, {
  foreignKey: "operatorId",
  as: "operatorCaseViews",
});
OperatorCaseView.belongsTo(User, {
  foreignKey: "operatorId",
  as: "operator",
});

Case.hasMany(OperatorCaseView, {
  foreignKey: "caseId",
  as: "operatorViews",
});
OperatorCaseView.belongsTo(Case, {
  foreignKey: "caseId",
  as: "case",
});

const syncDatabase = async () => {
  await sequelize.authenticate();
  console.log("Database connected successfully.");

  await sequelize.sync({ alter: true });
  console.log("Database synced successfully.");
};

module.exports = {
  sequelize,
  syncDatabase,
  User,
  Case,
  Family,
  FamilyMember,
  Seller,
  Property,
  ContractData,
  ContractActionLog,
  OperatorCaseView,
};