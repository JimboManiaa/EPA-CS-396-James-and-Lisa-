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
import XLSX from 'xlsx';

// Initialize Gemini client 
const ai = new GoogleGenAI();

// Configure multer to save files to uploads
const upload = multer({ dest: 'uploads/' });

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// point to public folder
const publicPath = path.join(__dirname, '../public');
app.use(express.static(publicPath));

console.log("Serving static files from:", publicPath);

// routes for html
app.get('/', (req, res) => res.sendFile(path.join(publicPath, 'index.html')));
app.get('/index.html', (req, res) => res.sendFile(path.join(publicPath, 'index.html')));
app.get('/explore.html', (req, res) => res.sendFile(path.join(publicPath, 'explore.html')));

// dropdown filters
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

// installed datasets routes
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

// API Route to get full normalized details for a specific dataset/facility
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

// API Route for Real-Unit Slider Metric Ranges
app.get('/api/metric-ranges', async (req, res) => {
  try {
    const maxRecord = await AnnualRecord.findOne({
      attributes: [
        [sequelize.fn('MAX', sequelize.col('gross_load')), 'maxGross'],
        [sequelize.fn('MAX', sequelize.col('co2_mass')), 'maxCO2'],
        [sequelize.fn('MAX', sequelize.col('nox_mass')), 'maxNOx'],
        [sequelize.fn('MAX', sequelize.col('so2_mass')), 'maxSO2']
      ],
      raw: true
    });

    res.json({
      maxGross: Math.ceil(maxRecord?.maxGross || 1000000),
      maxCO2: Math.ceil(maxRecord?.maxCO2 || 1000000),
      maxNOx: Math.ceil(maxRecord?.maxNOx || 50000),
      maxSO2: Math.ceil(maxRecord?.maxSO2 || 50000)
    });
  } catch (error) {
    console.error("Failed to load metric ranges:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// retrieval route
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

    const facilityWhere = {};
    if (facilityName) facilityWhere.facility_name = facilityName;
    if (dbId) facilityWhere.epa_facility_id = dbId;

    const unitWhere = {};
    if (programCode) unitWhere.unit_type = programCode;
    if (primaryFuel) unitWhere.primary_fuel = primaryFuel;
    if (secondaryFuel) unitWhere.secondary_fuel = secondaryFuel;

    const emissionsWhere = {};
    
    if (startDate || endDate) {
      emissionsWhere.reporting_year = {};
      if (startDate) emissionsWhere.reporting_year[Op.gte] = parseInt(startDate.split('-')[0]);
      if (endDate) emissionsWhere.reporting_year[Op.lte] = parseInt(endDate.split('-')[0]);
    }

    const minGross = parseFloat(minGrossLoad);
    const maxGross = parseFloat(maxGrossLoad);
    if (!isNaN(minGross) && minGross > 0) {
      emissionsWhere.gross_load = { ...(emissionsWhere.gross_load || {}), [Op.gte]: minGross };
    }
    if (!isNaN(maxGross)) {
      emissionsWhere.gross_load = { ...(emissionsWhere.gross_load || {}), [Op.lte]: maxGross };
    }

    const minC = parseFloat(minCO2);
    const maxC = parseFloat(maxCO2);
    if (!isNaN(minC) && minC > 0) {
      emissionsWhere.co2_mass = { ...(emissionsWhere.co2_mass || {}), [Op.gte]: minC };
    }
    if (!isNaN(maxC)) {
      emissionsWhere.co2_mass = { ...(emissionsWhere.co2_mass || {}), [Op.lte]: maxC };
    }

    const minN = parseFloat(minNOx);
    const maxN = parseFloat(maxNOx);
    if (!isNaN(minN) && minN > 0) {
      emissionsWhere.nox_mass = { ...(emissionsWhere.nox_mass || {}), [Op.gte]: minN };
    }
    if (!isNaN(maxN)) {
      emissionsWhere.nox_mass = { ...(emissionsWhere.nox_mass || {}), [Op.lte]: maxN };
    }

    const minS = parseFloat(minSO2);
    const maxS = parseFloat(maxSO2);
    if (!isNaN(minS) && minS > 0) {
      emissionsWhere.so2_mass = { ...(emissionsWhere.so2_mass || {}), [Op.gte]: minS };
    }
    if (!isNaN(maxS)) {
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

// CSV or XLSX download route
app.get('/api/download/:tableName', async (req, res) => {
  try {
    const { tableName } = req.params;
    const format = req.query.format || 'csv';
    let data = [];
    let filename = `${tableName}_export.${format}`;

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

    if (format === 'xlsx') {
        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Data");
        
        const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
        
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return res.status(200).send(buffer);
    } else {
        const keys = Object.keys(data[0]);
        let csvHeader = keys.join(',');
        let csvRows = data.map(row => 
          keys.map(key => JSON.stringify(row[key] ?? '')).join(',')
        );
        const csvContent = [csvHeader, ...csvRows].join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return res.status(200).send(csvContent);
    }

  } catch (error) {
    console.error('Download failed:', error);
    res.status(500).json({ error: 'Failed to generate download file' });
  }
});

// dataset download route
app.get('/api/download/dataset/:id', async (req, res) => {
  try {
    const datasetId = req.params.id;
    const format = req.query.format || 'csv';
    const dataset = await Dataset.findByPk(datasetId);
    
    if (!dataset) {
      return res.status(404).send('Dataset not found.');
    }

    let data = await AnnualRecord.findAll({ where: { dataset_id: datasetId }, raw: true });

    if (data.length === 0 && dataset.reporting_year) {
         data = await AnnualRecord.findAll({ where: { reporting_year: dataset.reporting_year }, raw: true });
    }

    if (data.length === 0) {
      return res.status(404).send('No records found for this dataset.');
    }

    const filename = `dataset_${datasetId}_export.${format}`;

    if (format === 'xlsx') {
        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Data");
        const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
        
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return res.status(200).send(buffer);
    } else {
        const keys = Object.keys(data[0]);
        let csvHeader = keys.join(',');
        let csvRows = data.map(row => 
          keys.map(key => JSON.stringify(row[key] ?? '')).join(',')
        );
        const csvContent = [csvHeader, ...csvRows].join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return res.status(200).send(csvContent);
    }

  } catch (error) {
    console.error('Dataset download failed:', error);
    res.status(500).json({ error: 'Failed to generate download file' });
  }
});

// AI assisted search route
app.get('/api/assisted-search', async (req, res) => {
    try {
        const userPrompt = req.query.q;
        if (!userPrompt) return res.status(400).json({ error: "Query is required" });

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

        const filters = JSON.parse(response.text);

        const facilityWhere = {};
        const unitWhere = {};
        const emissionsWhere = {};

        if (filters.year) emissionsWhere.reporting_year = filters.year;
        if (filters.state) facilityWhere.state = filters.state;
        if (filters.fuel) unitWhere.primary_fuel = filters.fuel;

        const hasFacilityFilter = Object.keys(facilityWhere).length > 0;
        const hasUnitFilter = Object.keys(unitWhere).length > 0;
        const hasEmissionFilter = Object.keys(emissionsWhere).length > 0;

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

app.get('/api/facilities', async (req, res) => {
  try {
    const facilities = await Facility.findAll({
        attributes: ['epa_facility_id', 'facility_name'],
        order: [['facility_name', 'ASC']]
    });
    res.json(facilities);
  } catch (error) {
    console.error("Failed to fetch facilities:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// csv and excel upload route
app.post('/api/upload-csv', upload.single('csvfile'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

  try {
    let lines = [];
    const filePath = req.file.path;
    const originalName = req.file.originalname.toLowerCase();

    if (originalName.endsWith('.xlsx') || originalName.endsWith('.xls')) {
      const workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      lines = rawRows.map(row => row.map(cell => cell !== undefined ? String(cell) : '').join(','));
    } else {
      const fileData = fs.readFileSync(filePath, 'utf8');
      lines = fileData.split(/\r?\n/).filter(line => line.trim() !== '');
    }
    
    const facilitiesMap = {};
    const unitsMap = {};
    const annualPayload = [];
    let skippedRows = 0; 

    for (let i = 1; i < lines.length; i++) {
      const row = lines[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(s => s.replace(/"/g, '').trim());
      
      // Validation Check 1: Minimum column length
      if (row.length < 24) {
        skippedRows++;
        continue; 
      }

      const state = row[0];
      const facName = row[1];
      const facId = parseInt(row[2]);
      const unitId = row[3];
      const year = parseInt(row[5]);
      
      // Validation Check 2: Require valid identifiers
      if (isNaN(facId) || isNaN(year)) {
        skippedRows++;
        continue;
      }

      if (!facilitiesMap[facId]) {
        facilitiesMap[facId] = { epa_facility_id: facId, facility_name: facName, state: state };
      }

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

    for (const fac of Object.values(facilitiesMap)) {
      await Facility.findOrCreate({ where: { epa_facility_id: fac.epa_facility_id }, defaults: fac });
    }

    const dbUnitKeys = {};
    for (const u of Object.values(unitsMap)) {
      const [unitRecord] = await Unit.findOrCreate({
        where: { epa_facility_id: u.epa_facility_id, epa_unit_id: u.epa_unit_id },
        defaults: u
      });
      dbUnitKeys[`${u.epa_facility_id}_${u.epa_unit_id}`] = unitRecord.unit_key;
    }

    const finalRecords = [];
    for (const record of annualPayload) {
      record.unit_key = dbUnitKeys[record._lookup_key];
      delete record._lookup_key;
      finalRecords.push(record);
    }

    // ==========================================
    // Duplicate Checking & Handling
    // ==========================================
    let duplicateCount = 0;
    
    const existingRecords = await AnnualRecord.findAll({
        where: {
            [Op.or]: finalRecords.map(r => ({
                unit_key: r.unit_key,
                reporting_year: r.reporting_year
            }))
        },
        attributes: ['unit_key', 'reporting_year'],
        raw: true
    });

    const existingSet = new Set(existingRecords.map(r => `${r.unit_key}_${r.reporting_year}`));
    const recordsToInsert = [];
    const seenInFile = new Set(); 

    for (const record of finalRecords) {
        const compositeKey = `${record.unit_key}_${record.reporting_year}`;
        
        if (existingSet.has(compositeKey) || seenInFile.has(compositeKey)) {
            duplicateCount++;
        } else {
            seenInFile.add(compositeKey);
            recordsToInsert.push(record);
        }
    }

    const newDataset = await Dataset.create({
      dataset_name: req.file.originalname.replace(/\.[^/.]+$/, ''),
      data_source: 'File Upload',
      reporting_year: recordsToInsert.length > 0 ? recordsToInsert[0].reporting_year : null,
      original_filename: req.file.originalname,
      raw_records: lines.length - 1,
      accepted_records: recordsToInsert.length
    });

    for (const record of recordsToInsert) {
      record.dataset_id = newDataset.dataset_id;
    }

    if (recordsToInsert.length > 0) {
        await AnnualRecord.bulkCreate(recordsToInsert, { ignoreDuplicates: true });
    }

    fs.unlinkSync(filePath);

    res.json({ 
      message: `Successfully processed file.`,
      accepted: recordsToInsert.length,
      rejected: skippedRows,
      duplicates: duplicateCount
    });
  } catch (error) {
    console.error("File processing failed:", error);
    res.status(500).json({ error: "Failed to process uploaded file." });
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