import { Sequelize, DataTypes } from 'sequelize';
import dotenv from 'dotenv';

dotenv.config();

const sequelize = new Sequelize(
  process.env.DB_NAME || 'epadata',
  process.env.DB_USER || 'root',
  process.env.DB_PASSWORD || '',
  {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    dialect: 'mysql',
    logging: false,
  }
);

// Define Dataset Model
const Dataset = sequelize.define('Dataset', {
  dataset_id: { type: DataTypes.INTEGER, primary_key: true, autoIncrement: true },
  dataset_name: { type: DataTypes.STRING(120), allowNull: false },
  data_source: { type: DataTypes.STRING(50), allowNull: false },
  reporting_year: { type: DataTypes.INTEGER, allowNull: false },
  retrieval_date: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  raw_records_count: { type: DataTypes.INTEGER, defaultValue: 0 },
  accepted_records_count: { type: DataTypes.INTEGER, defaultValue: 0 }
}, { tableName: 'datasets', timestamps: false });

// Define Facility Model
const Facility = sequelize.define('Facility', {
  epa_facility_id: { type: DataTypes.INTEGER, primary_key: true },
  facility_name: { type: DataTypes.STRING(200), allowNull: false },
  state: { type: DataTypes.STRING(2), allowNull: false },
  source_category: { type: DataTypes.STRING(100) }
}, { tableName: 'facilities', timestamps: false });

// Define Unit Model
const Unit = sequelize.define('Unit', {
  unit_key: { type: DataTypes.INTEGER, primary_key: true, autoIncrement: true },
  epa_unit_id: { type: DataTypes.STRING(50), allowNull: false },
  unit_type: { type: DataTypes.STRING(100) },
  primary_fuel: { type: DataTypes.STRING(50) }
}, { tableName: 'units', timestamps: false });

// Define AnnualRecord Model
const AnnualRecord = sequelize.define('AnnualRecord', {
  record_id: { type: DataTypes.INTEGER, primary_key: true, autoIncrement: true },
  reporting_year: { type: DataTypes.INTEGER, allowNull: false },
  operating_time: { type: DataTypes.FLOAT },
  gross_load: { type: DataTypes.FLOAT },
  heat_input: { type: DataTypes.FLOAT },
  co2_mass: { type: DataTypes.FLOAT },
  so2_mass: { type: DataTypes.FLOAT },
  nox_mass: { type: DataTypes.FLOAT }
}, { tableName: 'annual_records', timestamps: false });

// Establish Relationships & Constraints
Facility.hasMany(Unit, { foreignKey: 'epa_facility_id' });
Unit.belongsTo(Facility, { foreignKey: 'epa_facility_id' });

Dataset.hasMany(AnnualRecord, { foreignKey: 'dataset_id' });
AnnualRecord.belongsTo(Dataset, { foreignKey: 'dataset_id' });

Unit.hasMany(AnnualRecord, { foreignKey: 'unit_key' });
AnnualRecord.belongsTo(Unit, { foreignKey: 'unit_key' });

export { sequelize, Dataset, Facility, Unit, AnnualRecord };
