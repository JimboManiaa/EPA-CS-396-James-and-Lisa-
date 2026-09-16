import {
  sequelize,
  Facility,
  Unit,
  UnitFuel,
  UnitControl,
  UnitMonitoringMethod,
  QaTestRecord,
  HourlyEmissionsRecord
} from './node_models.mjs';

export async function ingestEpaPayload(payload) {
  const transaction = await sequelize.transaction();

  try {
    const {
      facility: facData,
      unit: unitData,
      fuels = [],
      controls = [],
      methods = [],
      qaTests = [],
      hourlyRecords = []
    } = payload;

    // 1. Facility & Owner Information
    const [facility] = await Facility.findOrCreate({
      where: { epa_facility_id: facData.epa_facility_id },
      defaults: {
        facility_name: facData.facility_name,
        owner: facData.owner,
        state: facData.state,
        county: facData.county,
        latitude: facData.latitude,
        longitude: facData.longitude,
        source_category: facData.source_category
      },
      transaction
    });

    // 2. Unit Configuration
    const [unit] = await Unit.findOrCreate({
      where: {
        epa_facility_id: facility.epa_facility_id,
        epa_unit_id: String(unitData.epa_unit_id)
      },
      defaults: {
        unit_type: unitData.unit_type
      },
      transaction
    });

    const unitKey = unit.unit_key;

    // 3. Primary & Secondary Fuels with Begin/End Dates
    for (const fuel of fuels) {
      await UnitFuel.create({
        unit_key: unitKey,
        fuel_type_indicator: fuel.fuel_type_indicator,
        fuel_code: fuel.fuel_code,
        begin_date: fuel.begin_date,
        end_date: fuel.end_date || null
      }, { transaction });
    }

    // 4. Control Equipment with Begin/End Dates
    for (const ctrl of controls) {
      await UnitControl.create({
        unit_key: unitKey,
        parameter: ctrl.parameter,
        control_code: ctrl.control_code,
        begin_date: ctrl.begin_date,
        end_date: ctrl.end_date || null
      }, { transaction });
    }

    // 5. Monitoring Methods with Begin/End Dates
    for (const method of methods) {
      await UnitMonitoringMethod.create({
        unit_key: unitKey,
        parameter: method.parameter,
        method_code: method.method_code,
        begin_date: method.begin_date,
        end_date: method.end_date || null
      }, { transaction });
    }

    // 6. QA Validations
    for (const test of qaTests) {
      await QaTestRecord.create({
        unit_key: unitKey,
        test_type: test.test_type,
        test_date: test.test_date,
        test_result: test.test_result,
        reference_value_difference: test.reference_value_difference
      }, { transaction });
    }

    // 7. Hourly Operations & SO2, NOx, CO2, Hg Emissions
    const hourlyPayload = hourlyRecords.map(h => ({
      unit_key: unitKey,
      op_timestamp: h.op_timestamp,
      gross_load_mwh: h.gross_load_mwh || null,
      steam_load_1000lbs: h.steam_load_1000lbs || null,
      heat_input_mmbtu: h.heat_input_mmbtu,
      so2_mass_tons: h.so2_mass_tons,
      nox_mass_tons: h.nox_mass_tons,
      co2_mass_tons: h.co2_mass_tons,
      hg_mass_tons: h.hg_mass_tons
    }));

    if (hourlyPayload.length > 0) {
      await HourlyEmissionsRecord.bulkCreate(hourlyPayload, {
        ignoreDuplicates: true,
        transaction
      });
    }

    await transaction.commit();
    console.log(`[Success] Committed records for Unit '${unitData.epa_unit_id}' at Facility ${facData.epa_facility_id} (${facData.facility_name}).`);
  } catch (error) {
    await transaction.rollback();
    console.error("[Error] Ingestion failed. Transaction rolled back:", error.message);
    throw error;
  }
}

async function main() {
  try {
    console.log("Connecting to MySQL and synchronizing tables...");
    await sequelize.sync({ alter: true });
    console.log("Database tables verified/synced.");

    const sampleData = {
      facility: {
        epa_facility_id: 3,
        facility_name: "Barry",
        owner: "Alabama Power Company",
        state: "AL",
        county: "Mobile",
        latitude: 31.0069,
        longitude: -88.0103,
        source_category: "Electric Utility"
      },
      unit: {
        epa_unit_id: "1",
        unit_type: "Tangential-fired boiler"
      },
      fuels: [
        { fuel_type_indicator: 'PRIMARY', fuel_code: 'Coal', begin_date: '1995-01-01', end_date: '2015-04-15' },
        { fuel_type_indicator: 'SECONDARY', fuel_code: 'Pipeline Natural Gas', begin_date: '1995-01-01', end_date: null }
      ],
      controls: [
        { parameter: 'SO2', control_code: 'Wet Limestone Scrubber', begin_date: '2000-05-01', end_date: null },
        { parameter: 'NOX', control_code: 'Low NOx Burner', begin_date: '1998-06-01', end_date: null }
      ],
      methods: [
        { parameter: 'SO2', method_code: 'CEMS', begin_date: '1995-01-01', end_date: null }
      ],
      qaTests: [
        { test_type: 'RATA', test_date: '2024-03-10', test_result: 'PASSED', reference_value_difference: 0.012 }
      ],
      hourlyRecords: [
        {
          op_timestamp: new Date('2024-01-01T00:00:00Z'),
          gross_load_mwh: 125.4,
          steam_load_1000lbs: null,
          heat_input_mmbtu: 1302.8,
          so2_mass_tons: 0.142,
          nox_mass_tons: 0.089,
          co2_mass_tons: 128.5,
          hg_mass_tons: 0.000012
        }
      ]
    };

    console.log("Starting ingestion run...");
    await ingestEpaPayload(sampleData);
    console.log("Ingestion completed successfully.");
  } finally {
    await sequelize.close();
    console.log("Database connection closed cleanly.");
  }
}

// Direct execution call
main().catch((err) => {
  console.error("Pipeline run failed:", err);
});