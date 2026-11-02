import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  sequelize,
  Dataset,
  Facility,
  Unit,
  AnnualRecord,
  TraciFactor
} from './node_models.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  try {
    console.log("Connecting to MySQL and synchronizing tables...");
    
    // Temporarily disable foreign key checks to allow schema sync
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
    await sequelize.sync({ alter: true });
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
    
    console.log("Database tables verified/synced for Annual Records and TRACI Factors.");

    // Create a tracking entry in the Datasets table if it doesn't exist
    await Dataset.findOrCreate({
      where: { dataset_name: "Initial Load", data_source: "EPA CAMPD" },
      defaults: {
        reporting_year: 2024,
        original_filename: "sample_data",
        raw_records: 1,
        accepted_records: 1
      }
    });

    // Create or find the Facility
    const [facility] = await Facility.findOrCreate({
      where: { epa_facility_id: 3 },
      defaults: {
        facility_name: "Barry",
        state: "AL",
        county: "Mobile",
        latitude: 31.0069,
        longitude: -88.0103,
        source_category: "Electric Utility"
      }
    });

    // Create or find the Unit 
    const [unit] = await Unit.findOrCreate({
      where: {
        epa_facility_id: facility.epa_facility_id,
        epa_unit_id: "1"
      },
      defaults: {
        unit_type: "Tangential-fired boiler",
        primary_fuel: "Coal",
        secondary_fuel: "Pipeline Natural Gas"
      }
    });

    // Create or find the Annual Record
    await AnnualRecord.findOrCreate({
      where: {
        unit_key: unit.unit_key,
        reporting_year: 2024
      },
      defaults: {
        operating_time: 8500.5,
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
      }
    });

    // Seed EPA TRACI 2.2 Air Characterization Factors
    await TraciFactor.bulkCreate([
      {
        traci_version: '2.2',
        pollutant_code: 'CO2',
        pollutant_name: 'CARBON DIOXIDE',
        compartment: 'Air',
        impact_category: 'Global Warming',
        factor_value: 1.0,
        factor_unit: 'kg CO2 eq / kg substance'
      },
      {
        traci_version: '2.2',
        pollutant_code: 'SO2',
        pollutant_name: 'SULFUR DIOXIDE',
        compartment: 'Air',
        impact_category: 'Acidification',
        factor_value: 1.0,
        factor_unit: 'kg SO2 eq / kg substance'
      },
      {
        traci_version: '2.2',
        pollutant_code: 'SO2',
        pollutant_name: 'SULFUR DIOXIDE',
        compartment: 'Air',
        impact_category: 'Human Health Particulate',
        factor_value: 0.06111111111111111,
        factor_unit: 'PM2.5 eq / kg substance'
      },
      {
        traci_version: '2.2',
        pollutant_code: 'NOx',
        pollutant_name: 'NITROGEN OXIDES',
        compartment: 'Air',
        impact_category: 'Acidification',
        factor_value: 0.7,
        factor_unit: 'kg SO2 eq / kg substance'
      },
      {
        traci_version: '2.2',
        pollutant_code: 'NOx',
        pollutant_name: 'NITROGEN OXIDES',
        compartment: 'Air',
        impact_category: 'Human Health Particulate',
        factor_value: 0.007222222222222222,
        factor_unit: 'PM2.5 eq / kg substance'
      },
      {
        traci_version: '2.2',
        pollutant_code: 'NOx',
        pollutant_name: 'NITROGEN OXIDES',
        compartment: 'Air',
        impact_category: 'Smog Formation',
        factor_value: 24.793589743589738,
        factor_unit: 'kg O3 eq / kg substance'
      }
    ], { ignoreDuplicates: true });

    console.log("Ingestion and TRACI 2.2 seeding completed successfully.");
    
  } catch (error) {
    console.error("Pipeline run failed:", error);
  } finally {
    await sequelize.close();
    console.log("Database connection closed cleanly.");
  }
}

main();