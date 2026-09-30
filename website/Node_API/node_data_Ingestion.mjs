import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  sequelize,
  Dataset,
  Facility,
  Unit,
  AnnualRecord
} from './node_models.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  try {
    console.log("Connecting to MySQL and synchronizing tables...");
    
    // Temporarily disable foreign key checks to allow a clean wipe
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
    // Force drop and recreate all tables for the new annual schema
    await sequelize.sync({ alter: true });
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
    
    console.log("Database tables verified/synced for Annual Records.");

    // 1. Create a tracking entry in the Datasets table
    const dataset = await Dataset.create({
      dataset_name: "Initial Load",
      data_source: "EPA CAMPD",
      reporting_year: 2024,
      original_filename: "sample_data",
      raw_records: 1,
      accepted_records: 1
    });

    // 2. Create the Facility
    const facility = await Facility.create({
      epa_facility_id: 3,
      facility_name: "Barry",
      state: "AL",
      county: "Mobile",
      latitude: 31.0069,
      longitude: -88.0103,
      source_category: "Electric Utility"
    });

    // 3. Create the Unit (now includes fuel types directly)
    const unit = await Unit.create({
      epa_facility_id: facility.epa_facility_id,
      epa_unit_id: "1",
      unit_type: "Tangential-fired boiler",
      primary_fuel: "Coal",
      secondary_fuel: "Pipeline Natural Gas"
    });

    // 4. Create the Annual Record
    await AnnualRecord.create({
      unit_key: unit.unit_key,
      reporting_year: 2024,
      operating_time: 8500.5, // Example annual values
      gross_load: 1500000.4,
      steam_load: null,
      heat_input: 12500000.8,
      co2_mass: 1300000.5,
      so2_mass: 1400.2,
      nox_mass: 890.1,
      so2_control: "Wet Limestone Scrubber",
      nox_control: "Low NOx Burner",
      pm_control: null,
      program_code: "ARP"
    });

    console.log("Ingestion completed successfully. Change 'force: true' back to 'alter: true' before running again.");
    
  } catch (error) {
    console.error("Pipeline run failed:", error);
  } finally {
    await sequelize.close();
    console.log("Database connection closed cleanly.");
  }
}

main();