import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { Op } from 'sequelize';
import { 
  sequelize, 
  Dataset,
  Facility, 
  Unit, 
  AnnualRecord 
} from './node_models.mjs';
import multer from 'multer';
import fs from 'fs';
import { GoogleGenAI } from '@google/genai';

// Initialize Gemini client (automatically uses process.env.GEMINI_API_KEY)
const ai = new GoogleGenAI();

// Configure multer to save files to an 'uploads' directory
const upload = multer({ dest: 'uploads/' });

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// 1. Point directly to your 'public' folder where HTML pages live
const publicPath = path.join(__dirname, '../public');
app.use(express.static(publicPath));

console.log("Serving static files from:", publicPath);

// 2. Explicit routes for core HTML pages
app.get('/', (req, res) => res.sendFile(path.join(publicPath, 'index.html')));
app.get('/index.html', (req, res) => res.sendFile(path.join(publicPath, 'index.html')));
app.get('/explore.html', (req, res) => res.sendFile(path.join(publicPath, 'explore.html')));

// 3. API Route for unique dropdown filter options
app.get('/api/filter-options', async (req, res) => {
  try {
    const facilities = await Facility.findAll({
      attributes: ['epa_facility_id', 'facility_name'],
      raw: true
    });

    const facilityNames = [...new Set(facilities.map(f => f.facility_name).filter(Boolean))].sort();
    const databaseIds = [...new Set(facilities.map(f => f.epa_facility_id).filter(Boolean))].sort();

    let primaryFuels = [];
    let secondaryFuels = [];
    let programCodes = [];

    try {
      const units = await Unit.findAll({ raw: true });
      primaryFuels = [...new Set(units.map(u => u.primary_fuel).filter(Boolean))].sort();
      secondaryFuels = [...new Set(units.map(u => u.secondary_fuel).filter(Boolean))].sort();
      programCodes = [...new Set(units.map(u => u.unit_type).filter(Boolean))].sort(); 
    } catch (e) {
      console.warn("Could not query Unit for program codes:", e.message);
    }

    res.json({
      facilityNames,
      databaseIds,
      primaryFuels,
      secondaryFuels,
      programCodes
    });
  } catch (error) {
    console.error("Failed to load filter options:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// 4. API Route for installed datasets list (Homepage)
app.get('/api/datasets', async (req, res) => {
  try {
    const datasets = await Dataset.findAll({ limit: 10 });

    const formattedData = datasets.map(ds => ({
      id: ds.dataset_id,
      name: ds.dataset_name,
      facility: ds.data_source,
      date: ds.retrieval_date ? new Date(ds.retrieval_date).toLocaleDateString() : 'N/A',
      status: `${ds.accepted_records || 0} records`
    }));

    res.json(formattedData);
  } catch (error) {
    console.error("Database query failed:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// 5. API Route to get full normalized details for a specific dataset/facility
app.get('/api/datasets/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const facility = await Facility.findByPk(id, {
      include: [
        {
          model: Unit,
          include: [AnnualRecord]
        }
      ]
    });

    if (!facility) {
      return res.status(404).json({ error: 'Dataset/Facility not found' });
    }

    res.json(facility);
  } catch (error) {
    console.error("Failed to fetch dataset details:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// 6. Filterable Retrieval Route
app.get('/api/retrieval-data', async (req, res) => {
  try {
    const { 
      startDate, endDate, facilityName, dbId, 
      primaryFuel, secondaryFuel, programCode,
      minGrossLoad, maxGrossLoad,
      minCO2, maxCO2,
      minNOx, maxNOx,
      minSO2, maxSO2
    } = req.query;

    // Facility level filters
    const facilityWhere = {};
    if (facilityName) facilityWhere.facility_name = facilityName;
    if (dbId) facilityWhere.epa_facility_id = dbId;

    // Unit level filters
    const unitWhere = {};
    if (programCode) unitWhere.unit_type = programCode;
    if (primaryFuel) unitWhere.primary_fuel = primaryFuel;
    if (secondaryFuel) unitWhere.secondary_fuel = secondaryFuel;

    // Emissions filters (dates & sliders)
    const emissionsWhere = {};
    
    // Convert HTML date inputs to Year integers if provided
    if (startDate || endDate) {
      emissionsWhere.reporting_year = {};
      if (startDate) emissionsWhere.reporting_year[Op.gte] = parseInt(startDate.split('-')[0]);
      if (endDate) emissionsWhere.reporting_year[Op.lte] = parseInt(endDate.split('-')[0]);
    }

    // Only apply slider bounds if user has adjusted away from default 0 or 100
    const minGross = parseFloat(minGrossLoad);
    const maxGross = parseFloat(maxGrossLoad);
    if (!isNaN(minGross) && minGross > 0) {
      emissionsWhere.gross_load = { ...(emissionsWhere.gross_load || {}), [Op.gte]: minGross };
    }
    if (!isNaN(maxGross) && maxGross < 100) {
      emissionsWhere.gross_load = { ...(emissionsWhere.gross_load || {}), [Op.lte]: maxGross };
    }

    const minC = parseFloat(minCO2);
    const maxC = parseFloat(maxCO2);
    if (!isNaN(minC) && minC > 0) {
      emissionsWhere.co2_mass = { ...(emissionsWhere.co2_mass || {}), [Op.gte]: minC };
    }
    if (!isNaN(maxC) && maxC < 100) {
      emissionsWhere.co2_mass = { ...(emissionsWhere.co2_mass || {}), [Op.lte]: maxC };
    }

    const minN = parseFloat(minNOx);
    const maxN = parseFloat(maxNOx);
    if (!isNaN(minN) && minN > 0) {
      emissionsWhere.nox_mass = { ...(emissionsWhere.nox_mass || {}), [Op.gte]: minN };
    }
    if (!isNaN(maxN) && maxN < 100) {
      emissionsWhere.nox_mass = { ...(emissionsWhere.nox_mass || {}), [Op.lte]: maxN };
    }

    const minS = parseFloat(minSO2);
    const maxS = parseFloat(maxSO2);
    if (!isNaN(minS) && minS > 0) {
      emissionsWhere.so2_mass = { ...(emissionsWhere.so2_mass || {}), [Op.gte]: minS };
    }
    if (!isNaN(maxS) && maxS < 100) {
      emissionsWhere.so2_mass = { ...(emissionsWhere.so2_mass || {}), [Op.lte]: maxS };
    }

    const hasEmissionFilter = Object.keys(emissionsWhere).length > 0;
    const hasUnitFilter = Object.keys(unitWhere).length > 0;

    const includeArr = [
      {
        model: Unit,
        required: true, 
        where: hasUnitFilter ? unitWhere : undefined,
        include: [
          {
            model: AnnualRecord,
            required: true, 
            where: hasEmissionFilter ? emissionsWhere : undefined
          }
        ]
      }
    ];

    const facilities = await Facility.findAll({
      where: facilityWhere,
      include: includeArr,
      limit: 250 
    });

    // Flatten data for table rendering
    const flatData = [];
    facilities.forEach(fac => {
      fac.Units.forEach(unit => {
        unit.AnnualRecords.forEach(record => {
          flatData.push({
            "Facility Name": fac.facility_name,
            "EPA ID": fac.epa_facility_id,
            "State": fac.state,
            "Unit ID": unit.epa_unit_id,
            "Unit Type": unit.unit_type || "N/A",
            "Primary Fuel": unit.primary_fuel || "N/A",
            "Reporting Year": record.reporting_year,
            "Gross Load (MWh)": record.gross_load ?? "N/A",
            "CO2 (tons)": record.co2_mass ?? "N/A",
            "NOx (tons)": record.nox_mass ?? "N/A",
            "SO2 (tons)": record.so2_mass ?? "N/A"
          });
        });
      });
    });

    res.json(flatData);
  } catch (error) {
    console.error("Database query failed:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// 7. API Route to Download a Selected Database Table as a CSV
app.get('/api/download/:tableName', async (req, res) => {
  try {
    const { tableName } = req.params;
    let data = [];
    let filename = `${tableName}_export.csv`;

    if (tableName === 'facilities') {
      data = await Facility.findAll({ raw: true });
    } else if (tableName === 'units') {
      data = await Unit.findAll({ raw: true });
    } else if (tableName === 'annual_records') {
      data = await AnnualRecord.findAll({ limit: 1000, raw: true });
    } else if (tableName === 'datasets') {
      data = await Dataset.findAll({ raw: true });
    } else {
      return res.status(400).json({ error: 'Invalid table selected' });
    }

    if (data.length === 0) {
      return res.status(404).send('No data found in this table.');
    }

    const keys = Object.keys(data[0]);
    let csvHeader = keys.join(',');
    let csvRows = data.map(row => 
      keys.map(key => JSON.stringify(row[key] ?? '')).join(',')
    );
    const csvContent = [csvHeader, ...csvRows].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.status(200).send(csvContent);

  } catch (error) {
    console.error('Download failed:', error);
    res.status(500).json({ error: 'Failed to generate download file' });
  }
});
// 10. API Route for AI Assisted Search (Using Google Gemini)
app.get('/api/assisted-search', async (req, res) => {
    try {
        const userPrompt = req.query.q;
        if (!userPrompt) return res.status(400).json({ error: "Query is required" });

        // 1. Send the prompt to Gemini and force a JSON output structure
        const response = await ai.models.generateContent({
            model: "gemini-3.7-flash",
            contents: `Convert this user search into a JSON filter object: "${userPrompt}"`,
            config: {
                systemInstruction: `You extract filters from power plant data searches. Return ONLY a valid JSON object.
Use these keys if the data is present in the search:
- "year" (integer, e.g., 2024)
- "state" (2-letter uppercase US state abbreviation, e.g., "KY")
- "fuel" (string, strictly "Coal" or "Pipeline Natural Gas")

If a filter is not mentioned, DO NOT include the key in the JSON.`,
                responseMimeType: "application/json"
            }
        });

        // 2. Parse the AI's JSON output
        const filters = JSON.parse(response.text);
        console.log("Gemini Extracted Filters:", filters); // Check your terminal to see the AI's logic!

        // 3. Map the AI filters directly to your Sequelize logic
        const facilityWhere = {};
        const unitWhere = {};
        const emissionsWhere = {};

        if (filters.year) emissionsWhere.reporting_year = filters.year;
        if (filters.state) facilityWhere.state = filters.state;
        if (filters.fuel) unitWhere.primary_fuel = filters.fuel;

        const hasFacilityFilter = Object.keys(facilityWhere).length > 0;
        const hasUnitFilter = Object.keys(unitWhere).length > 0;
        const hasEmissionFilter = Object.keys(emissionsWhere).length > 0;

        // 4. Run the dynamic Sequelize Query
        const facilities = await Facility.findAll({
            where: hasFacilityFilter ? facilityWhere : undefined,
            include: [
                {
                    model: Unit,
                    required: hasUnitFilter || hasEmissionFilter,
                    where: hasUnitFilter ? unitWhere : undefined,
                    include: [
                        {
                            model: AnnualRecord,
                            required: hasEmissionFilter,
                            where: hasEmissionFilter ? emissionsWhere : undefined
                        }
                    ]
                }
            ],
            limit: 250
        });

        // 5. Flatten the filtered results for the frontend table
        const flatData = [];
        facilities.forEach(fac => {
            fac.Units.forEach(unit => {
                if (unit.AnnualRecords && unit.AnnualRecords.length > 0) {
                    unit.AnnualRecords.forEach(record => {
                        flatData.push({
                            "Facility Name": fac.facility_name,
                            "EPA ID": fac.epa_facility_id,
                            "State": fac.state,
                            "Unit ID": unit.epa_unit_id,
                            "Unit Type": unit.unit_type || "N/A",
                            "Primary Fuel": unit.primary_fuel || "N/A",
                            "Reporting Year": record.reporting_year,
                            "Gross Load (MWh)": record.gross_load ?? 0,
                            "CO2 (tons)": record.co2_mass ?? 0,
                            "NOx (tons)": record.nox_mass ?? 0,
                            "SO2 (tons)": record.so2_mass ?? 0
                        });
                    });
                }
            });
        });

        // 6. Sort results alphabetically, then by Year descending
        flatData.sort((a, b) => {
            if (a["Facility Name"] !== b["Facility Name"]) {
                return a["Facility Name"].localeCompare(b["Facility Name"]);
            }
            return b["Reporting Year"] - a["Reporting Year"];
        });

        res.json(flatData);
    } catch (error) {
        console.error("Assisted search failed:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});
// 9. API Route for CSV Uploads (Annual Data Mapped to Project Specs)
app.post('/api/upload-csv', upload.single('csvfile'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

  try {
    const fileData = fs.readFileSync(req.file.path, 'utf8');
    const lines = fileData.split(/\r?\n/).filter(line => line.trim() !== '');
    
    const facilitiesMap = {};
    const unitsMap = {};
    const annualPayload = [];

    // STARTING AT i=1 TO SKIP HEADER
    for (let i = 1; i < lines.length; i++) {
      // Split by comma, respecting quotes to prevent breaking on data like "Low NOx, PM"
      // Strip all double quotes globally from every cell using .replace(/"/g, '')
      const row = lines[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(s => s.replace(/"/g, '').trim());
      
      if (row.length < 24) continue; // Skip malformed rows

      const state = row[0];
      const facName = row[1];
      const facId = parseInt(row[2]);
      const unitId = row[3];
      const year = parseInt(row[5]);
      
      if (isNaN(facId) || isNaN(year)) continue;

      // Extract and map Facility profile
      if (!facilitiesMap[facId]) {
        facilitiesMap[facId] = { epa_facility_id: facId, facility_name: facName, state: state };
      }

      // Extract and map Unit profile
      const unitKeyStr = `${facId}_${unitId}`;
      if (!unitsMap[unitKeyStr]) {
        unitsMap[unitKeyStr] = {
          epa_facility_id: facId, 
          epa_unit_id: unitId,
          unit_type: row[19] || null, 
          primary_fuel: row[17] || null, 
          secondary_fuel: row[18] || null
        };
      }

      // Stage Annual Data temporarily (requires unit_key lookup later)
      annualPayload.push({
        _lookup_key: unitKeyStr,
        reporting_year: year,       
        operating_time: parseFloat(row[7]) || null,   
        gross_load: parseFloat(row[8]) || null, 
        steam_load: parseFloat(row[9]) || null,
        so2_mass: parseFloat(row[10]) || null,    
        co2_mass: parseFloat(row[12]) || null,    
        nox_mass: parseFloat(row[14]) || null,    
        heat_input: parseFloat(row[16]) || null,
        so2_control: row[20] || null,
        nox_control: row[21] || null,
        pm_control: row[22] || null,
        program_code: row[24] || null
      });
    }

    // 1. Insert all new Facilities identified in the CSV
    for (const fac of Object.values(facilitiesMap)) {
      await Facility.findOrCreate({ where: { epa_facility_id: fac.epa_facility_id }, defaults: fac });
    }

    // 2. Insert all new Units and map their internal database IDs
    const dbUnitKeys = {};
    for (const u of Object.values(unitsMap)) {
      const [unitRecord] = await Unit.findOrCreate({
        where: { epa_facility_id: u.epa_facility_id, epa_unit_id: u.epa_unit_id },
        defaults: u
      });
      dbUnitKeys[`${u.epa_facility_id}_${u.epa_unit_id}`] = unitRecord.unit_key;
    }

    // 3. Finalize Payload with real unit_keys
    const finalRecords = [];
    for (const record of annualPayload) {
      record.unit_key = dbUnitKeys[record._lookup_key];
      delete record._lookup_key;
      finalRecords.push(record);
    }

    // 4. Bulk Insert (Ignores duplicates if re-uploading the exact same unit+year)
    await AnnualRecord.bulkCreate(finalRecords, { ignoreDuplicates: true });

    // 5. Update Dataset tracking table
    await Dataset.create({
      dataset_name: req.file.originalname.replace('.csv', ''),
      data_source: 'CSV Upload',
      reporting_year: finalRecords.length > 0 ? finalRecords[0].reporting_year : null,
      original_filename: req.file.originalname,
      raw_records: lines.length - 1,
      accepted_records: finalRecords.length
    });

    // Clean up temporary upload file
    fs.unlinkSync(req.file.path);

    res.json({ message: `Successfully parsed and saved ${finalRecords.length} annual records.` });
  } catch (error) {
    console.error("File processing failed:", error);
    res.status(500).json({ error: "Failed to process CSV file." });
  }
});

// 8. Start server and verify database connection
async function startServer() {
  try {
    await sequelize.authenticate();
    console.log("Database connection established successfully.");
    
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Unable to connect to the database:", error);
  }
}

startServer();