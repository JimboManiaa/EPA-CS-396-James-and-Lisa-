import { Sequelize, DataTypes } from 'sequelize';
import dotenv from 'dotenv';

dotenv.config();

export const sequelize = new Sequelize(
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

// 1. Dataset Tracking
export const Dataset = sequelize.define('Dataset', {
  dataset_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  dataset_name: { type: DataTypes.STRING(255) },
  data_source: { type: DataTypes.STRING(255) },
  reporting_year: { type: DataTypes.INTEGER },
  retrieval_date: { type: DataTypes.DATE, defaultValue: Sequelize.NOW },
  original_filename: { type: DataTypes.STRING(255) },
  raw_records: { type: DataTypes.INTEGER },
  accepted_records: { type: DataTypes.INTEGER },
  notes: { type: DataTypes.TEXT }
}, { tableName: 'datasets', timestamps: false });

// 2. Facility Profile
export const Facility = sequelize.define('Facility', {
  epa_facility_id: { type: DataTypes.INTEGER, primaryKey: true },
  facility_name: { type: DataTypes.STRING(255), allowNull: false },
  state: { type: DataTypes.STRING(2), allowNull: false },
  county: { type: DataTypes.STRING(100) },
  latitude: { type: DataTypes.FLOAT },
  longitude: { type: DataTypes.FLOAT },
  source_category: { type: DataTypes.STRING(255) }
}, { tableName: 'facilities', timestamps: false });

// 3. Unit Configuration 
export const Unit = sequelize.define('Unit', {
  unit_key: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  epa_facility_id: { type: DataTypes.INTEGER, allowNull: false },
  epa_unit_id: { type: DataTypes.STRING(100), allowNull: false },
  unit_type: { type: DataTypes.STRING(255) },
  primary_fuel: { type: DataTypes.STRING(255) },
  secondary_fuel: { type: DataTypes.STRING(255) },
  operating_date: { type: DataTypes.DATEONLY },
  retirement_date: { type: DataTypes.DATEONLY }
}, {
  tableName: 'units',
  timestamps: false,
  indexes: [{ unique: true, fields: ['epa_facility_id', 'epa_unit_id'] }]
});

// 4. Annual Records
export const AnnualRecord = sequelize.define('AnnualRecord', {
  record_id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  unit_key: { type: DataTypes.INTEGER, allowNull: false },
  reporting_year: { type: DataTypes.INTEGER, allowNull: false },
  operating_time: { type: DataTypes.FLOAT },
  gross_load: { type: DataTypes.FLOAT },
  steam_load: { type: DataTypes.FLOAT },
  heat_input: { type: DataTypes.FLOAT },
  co2_mass: { type: DataTypes.FLOAT },
  so2_mass: { type: DataTypes.FLOAT },
  nox_mass: { type: DataTypes.FLOAT },
  so2_control: { type: DataTypes.STRING(255) },
  nox_control: { type: DataTypes.STRING(255) },
  pm_control: { type: DataTypes.STRING(255) },
  program_code: { type: DataTypes.STRING(255) }
}, {
  tableName: 'annual_records',
  timestamps: false,
  indexes: [{ unique: true, fields: ['unit_key', 'reporting_year'] }]
});

// Relationships
Facility.hasMany(Unit, { foreignKey: 'epa_facility_id' });
Unit.belongsTo(Facility, { foreignKey: 'epa_facility_id' });

Unit.hasMany(AnnualRecord, { foreignKey: 'unit_key' });
AnnualRecord.belongsTo(Unit, { foreignKey: 'unit_key' });

Dataset.hasMany(AnnualRecord, { foreignKey: 'dataset_id' });