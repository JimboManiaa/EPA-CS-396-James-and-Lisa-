import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
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

// 3. API Route for your installed datasets list (Homepage)
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

// 4. API Route to get full normalized details for a specific dataset/facility
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

// 5. API Route to Download a Selected Database Table as a CSV
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

    // Convert JSON records into CSV format
    const keys = Object.keys(data[0]);
    let csvHeader = keys.join(',');
    let csvRows = data.map(row => 
      keys.map(key => JSON.stringify(row[key] ?? '')).join(',')
    );
    const csvContent = [csvHeader, ...csvRows].join('\n');

    // Trigger browser file download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.status(200).send(csvContent);

  } catch (error) {
    console.error('Download failed:', error);
    res.status(500).json({ error: 'Failed to generate download file' });
  }
});

// 6. Start server and verify database connection
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