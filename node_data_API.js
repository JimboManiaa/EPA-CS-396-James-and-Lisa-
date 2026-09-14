import axios from 'axios';
import { sequelize, Dataset, Facility, Unit, AnnualRecord } from './models.js';

async function fetchAndIngestEpaData(year) {
  const apiKey = process.env.EPA_API_KEY;
  if (!apiKey) {
    console.error("Error: EPA_API_KEY missing from environment variables.");
    return;
  }

  const url = "https://epa.gov";
  
  try {
    console.log(`Connecting to EPA CAMPD API for year ${year}...`);
    const response = await axios.get(url, {
      headers: { 'x-api-key': apiKey },
      params: { year: year, page: 1, perPage: 1000 }
    });

    const records = response.data;
    console.log(`Successfully retrieved ${records.length} records from API.`);

    // 1. Create Dataset metadata entry
    const dataset = await Dataset.create({
      dataset_name: `EPA CAMPD API Pull - Year ${year}`,
      data_source: "EPA_API_REST",
      reporting_year: year,
      raw_records_count: records.length
    });

    let acceptedCount = 0;

    // Loop through each record and process sequentially to maintain constraints safely
    for (const row of records) {
      const facId = row.facilityId;
      const unitId = String(row.unitId || '').trim();

      if (!facId || !unitId) continue;

      // 2. Find or Create Facility
      const [facility] = await Facility.findOrCreate({
        where: { epa_facility_id: facId },
        defaults: {
          facility_name: row.facilityName || `Facility ${facId}`,
          state: row.stateCode,
          source_category: row.sourceCategory
        }
      });

      // 3. Find or Create Unit
      const [unit] = await Unit.findOrCreate({
        where: { epa_facility_id: facId, epa_unit_id: unitId },
        defaults: {
          unit_type: row.unitType,
          primary_fuel: row.primaryFuelInfo
        }
      });

      // 4. Find or Create Annual Record (Prevents duplicates)
      const [annualRec, created] = await AnnualRecord.findOrCreate({
        where: { unit_key: unit.unit_key, reporting_year: year },
        defaults: {
          dataset_id: dataset.dataset_id,
          operating_time: row.operatingTime,
          gross_load: row.grossLoad,
          heat_input: row.heatInput,
          co2_mass: row.co2Mass,
          so2_mass: row.so2Mass,
          nox_mass: row.noxMass
        }
      });

      if (created) {
        acceptedCount++;
      }
    }

    // Update dataset with how many records were successfully written
    await dataset.update({ accepted_records_count: acceptedCount });
    console.log(`Ingest complete! Saved ${acceptedCount} new records to MySQL.`);

  } catch (error) {
    console.error("Error running the Node.js ingestion pipeline:", error.message);
  }
}

// Kick off script
async function run() {
  // Sync models with MySQL database (Creates tables if they don't exist)
  await sequelize.sync(); 
  
  // Run pipeline
  await fetchAndIngestEpaData(2024);
  
  // Close DB connection cleanly
  await sequelize.close();
}

run();
