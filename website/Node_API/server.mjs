import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { sequelize, Facility, Unit } from './node_models.mjs';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// 1. Point directly to your 'public' folder where index.html lives
const publicPath = path.join(__dirname, '../public');
app.use(express.static(publicPath));

console.log("Serving static files from:", publicPath);

// 2. Explicit routes for the homepage
app.get('/', (req, res) => {
  res.sendFile(path.join(publicPath, 'index.html'));
});

app.get('/index.html', (req, res) => {
  res.sendFile(path.join(publicPath, 'index.html'));
});

// 3. API Route for your installed datasets table
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

// 4. Start server and verify database connection
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