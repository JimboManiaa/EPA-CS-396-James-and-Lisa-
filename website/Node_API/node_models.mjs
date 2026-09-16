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

// 1. Facility & Owner Information
export const Facility = sequelize.define('Facility', {
  epa_facility_id: { type: DataTypes.INTEGER, primaryKey: true },
  facility_name: { type: DataTypes.STRING(200), nullable: false },
  owner: { type: DataTypes.STRING(255) },
  state: { type: DataTypes.STRING(2), nullable: false },
  county: { type: DataTypes.STRING(100) },
  latitude: { type: DataTypes.FLOAT },
  longitude: { type: DataTypes.FLOAT },
  source_category: { type: DataTypes.STRING(100) }
}, { tableName: 'facilities', timestamps: false });

// 2. Unit Configuration
export const Unit = sequelize.define('Unit', {
  unit_key: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  epa_facility_id: { type: DataTypes.INTEGER, allowNull: false },
  epa_unit_id: { type: DataTypes.STRING(50), allowNull: false },
  unit_type: { type: DataTypes.STRING(100) }
}, {
  tableName: 'units',
  timestamps: false,
  indexes: [{ unique: true, fields: ['epa_facility_id', 'epa_unit_id'] }]
});

// 3. Fuels and Effective Date Ranges
export const UnitFuel = sequelize.define('UnitFuel', {
  fuel_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  unit_key: { type: DataTypes.INTEGER, allowNull: false },
  fuel_type_indicator: { type: DataTypes.ENUM('PRIMARY', 'SECONDARY'), allowNull: false },
  fuel_code: { type: DataTypes.STRING(50), allowNull: false },
  begin_date: { type: DataTypes.DATEONLY },
  end_date: { type: DataTypes.DATEONLY }
}, { tableName: 'unit_fuels', timestamps: false });

// 4. Control Equipment and Effective Dates
export const UnitControl = sequelize.define('UnitControl', {
  control_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  unit_key: { type: DataTypes.INTEGER, allowNull: false },
  parameter: { type: DataTypes.STRING(20), allowNull: false }, // SO2, NOX, PM, HG
  control_code: { type: DataTypes.STRING(50), allowNull: false },
  begin_date: { type: DataTypes.DATEONLY },
  end_date: { type: DataTypes.DATEONLY }
}, { tableName: 'unit_controls', timestamps: false });

// 5. Monitoring Methods & Dates
export const UnitMonitoringMethod = sequelize.define('UnitMonitoringMethod', {
  method_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  unit_key: { type: DataTypes.INTEGER, allowNull: false },
  parameter: { type: DataTypes.STRING(20), allowNull: false },
  method_code: { type: DataTypes.STRING(50), allowNull: false },
  begin_date: { type: DataTypes.DATEONLY },
  end_date: { type: DataTypes.DATEONLY }
}, { tableName: 'unit_monitoring_methods', timestamps: false });

// 6. QA Test Validations
export const QaTestRecord = sequelize.define('QaTestRecord', {
  test_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  unit_key: { type: DataTypes.INTEGER, allowNull: false },
  test_type: { type: DataTypes.STRING(50), allowNull: false }, // e.g., RATA, Linearity
  test_date: { type: DataTypes.DATEONLY, allowNull: false },
  test_result: { type: DataTypes.STRING(50) },
  reference_value_difference: { type: DataTypes.FLOAT }
}, { tableName: 'qa_test_records', timestamps: false });

// 7. Hourly Operations & Emissions (SO2, NOx, CO2, Hg)
export const HourlyEmissionsRecord = sequelize.define('HourlyEmissionsRecord', {
  record_id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  unit_key: { type: DataTypes.INTEGER, allowNull: false },
  op_timestamp: { type: DataTypes.DATE, allowNull: false },
  gross_load_mwh: { type: DataTypes.FLOAT },
  steam_load_1000lbs: { type: DataTypes.FLOAT },
  heat_input_mmbtu: { type: DataTypes.FLOAT },
  so2_mass_tons: { type: DataTypes.FLOAT },
  nox_mass_tons: { type: DataTypes.FLOAT },
  co2_mass_tons: { type: DataTypes.FLOAT },
  hg_mass_tons: { type: DataTypes.FLOAT }
}, {
  tableName: 'hourly_emissions_records',
  timestamps: false,
  indexes: [{ unique: true, fields: ['unit_key', 'op_timestamp'] }]
});

// Relationships
Facility.hasMany(Unit, { foreignKey: 'epa_facility_id' });
Unit.belongsTo(Facility, { foreignKey: 'epa_facility_id' });

Unit.hasMany(UnitFuel, { foreignKey: 'unit_key' });
Unit.hasMany(UnitControl, { foreignKey: 'unit_key' });
Unit.hasMany(UnitMonitoringMethod, { foreignKey: 'unit_key' });
Unit.hasMany(QaTestRecord, { foreignKey: 'unit_key' });
Unit.hasMany(HourlyEmissionsRecord, { foreignKey: 'unit_key' });