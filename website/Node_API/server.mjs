import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { Op } from 'sequelize';
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

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize app BEFORE defining any app.use or app.get routes
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// 1. Point directly to your 'public' folder where HTML pages live
const publicPath = path.join(__dirname, '../public');
app.use(express.static(publicPath));

console.log("Serving static files from:", publicPath);

// 2. Explicit routes for core HTML pages
app.get('/', (req, res) => {
  res.sendFile(path.join(publicPath, 'index.html'));
});

app.get('/index.html', (req, res) => {
  res.sendFile(path.join(publicPath, 'index.html'));
});

app.get('/explore.html', (req, res) => {
  res.sendFile(path.join(publicPath, 'explore.html'));
});

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
      const fuels = await UnitFuel.findAll({ raw: true });
      primaryFuels = [...new Set(fuels.map(f => f.fuel_type || f.primary_fuel_type).filter(Boolean))].sort();
      secondaryFuels = [...new Set(fuels.map(f => f.secondary_fuel_type).filter(Boolean))].sort();
    } catch (e) {
      console.warn("Could not query UnitFuel for dropdowns:", e.message);
    }

    try {
      const units = await Unit.findAll({ raw: true });
      programCodes = [...new Set(units.map(u => u.program_code).filter(Boolean))].sort();
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
    const facilities = await Facility.findAll({
      include: [Unit],
      limit: 10
    });

    const formattedData = facilities.map(fac => ({
      id: fac.epa_facility_id,
      name: fac.facility_name,
      facility: fac.county ? `${fac.county} County (${fac.state})` : fac.state,
      date: "2026-09-21",
      status: "active"
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
          include: [
            UnitFuel,
            UnitControl,
            UnitMonitoringMethod,
            QaTestRecord
          ]
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
      primaryFuel, secondaryFuel, programCode
    } = req.query;

    const facilityWhere = {};
    if (facilityName) facilityWhere.facility_name = facilityName;
    if (dbId) facilityWhere.epa_facility_id = dbId;

    const unitWhere = {};
    if (programCode) unitWhere.program_code = programCode;

    const include = [
      {
        model: Unit,
        required: Object.keys(unitWhere).length > 0 || !!(primaryFuel || secondaryFuel),
        where: Object.keys(unitWhere).length > 0 ? unitWhere : undefined,
        include: [
          {
            model: UnitFuel,
            required: !!(primaryFuel || secondaryFuel),
            where: {
              ...(primaryFuel ? { fuel_type: primaryFuel } : {}),
              ...(secondaryFuel ? { secondary_fuel_type: secondaryFuel } : {})
            }
          }
        ]
      }
    ];

    const facilities = await Facility.findAll({
      where: facilityWhere,
      include: (Object.keys(unitWhere).length > 0 || primaryFuel || secondaryFuel) ? include : [],
      limit: 200
    });

    const formattedData = facilities.map(fac => ({
      id: fac.epa_facility_id,
      name: fac.facility_name,
      facility: fac.county ? `${fac.county} County (${fac.state})` : fac.state,
      date: "2026-09-21",
      status: "active"
    }));

    res.json(formattedData);
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
    } else if (tableName === 'hourly_emissions') {
      data = await HourlyEmissionsRecord.findAll({ limit: 1000, raw: true });
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