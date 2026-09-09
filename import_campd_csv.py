import os
import pandas as pd
from datetime import datetime
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Import your models from models.py
from models import Base, Dataset, Facility, Unit, AnnualRecord

load_dotenv()

# MySQL Database connection
USER = os.getenv("DB_USER", "root")
PWD = os.getenv("DB_PASSWORD", "")
HOST = os.getenv("DB_HOST", "localhost")
PORT = os.getenv("DB_PORT", "3306")
DB_NAME = os.getenv("DB_NAME", "epadata")

DATABASE_URL = f"mysql+pymysql://{USER}:{PWD}@{HOST}:{PORT}/{DB_NAME}"
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)

def get_col(row, possible_keys, default=None):
    """Safely extracts a column value across multiple EPA naming formats."""
    for key in possible_keys:
        if key in row and pd.notna(row[key]):
            val = row[key]
            # Convert float strings or numbers to appropriate clean types
            if isinstance(val, str):
                val = val.strip()
            return val
    return default

def import_csv_to_mysql(file_path: str):
    if not os.path.exists(file_path):
        print(f"Error: File not found at {file_path}")
        return

    print("Reading CSV file into memory...")
    df = pd.read_csv(file_path, low_memory=False)
    
    # Strip whitespace from column headers
    df.columns = [str(c).strip() for c in df.columns]
    
    total_rows = len(df)
    print(f"Found {total_rows} total rows in CSV.")

    session = SessionLocal()
    try:
        # Determine reporting year from data if available
        sample_year = get_col(df.iloc[0], ['Year', 'year', 'Reporting Year'], default=2023)
        
        # 1. Register Dataset Entry
        dataset = Dataset(
            dataset_name="CAMPD Unit-Level Ingest",
            data_source="CAMPD_CSV",
            reporting_year=int(sample_year),
            retrieval_date=datetime.utcnow(),
            original_filename=os.path.basename(file_path),
            raw_records_count=total_rows
        )
        session.add(dataset)
        session.flush()

        accepted_count = 0
        skipped_duplicates = 0

        print("Ingesting records into MySQL...")
        for idx, row in df.iterrows():
            fac_id = get_col(row, ['Facility ID', 'Facility ID (ORISPL)', 'facilityId'])
            unit_id = str(get_col(row, ['Unit ID', 'Unit', 'unitId']) or '').strip()
            year = get_col(row, ['Year', 'year', 'Reporting Year'], default=sample_year)

            # Skip rows missing vital keys
            if not fac_id or not unit_id or unit_id == 'nan':
                continue

            fac_id = int(fac_id)
            year = int(year)

            # 2. Facility check / insert
            facility = session.query(Facility).filter_by(epa_facility_id=fac_id).first()
            if not facility:
                facility = Facility(
                    epa_facility_id=fac_id,
                    facility_name=get_col(row, ['Facility Name', 'facilityName'], default=f"Facility {fac_id}"),
                    state=get_col(row, ['State', 'stateCode', 'state']),
                    county=get_col(row, ['County', 'county']),
                    latitude=get_col(row, ['Latitude', 'latitude']),
                    longitude=get_col(row, ['Longitude', 'longitude']),
                    source_category=get_col(row, ['Source Category', 'sourceCategory'])
                )
                session.add(facility)
                session.flush()

            # 3. Unit check / insert
            unit = session.query(Unit).filter_by(
                epa_facility_id=fac_id,
                epa_unit_id=unit_id
            ).first()

            if not unit:
                unit = Unit(
                    epa_facility_id=fac_id,
                    epa_unit_id=unit_id,
                    unit_type=get_col(row, ['Unit Type', 'unitType']),
                    primary_fuel=get_col(row, ['Primary Fuel Info', 'Primary Fuel Type', 'Primary Fuel']),
                    secondary_fuel=get_col(row, ['Secondary Fuel Info', 'Secondary Fuel Type', 'Secondary Fuel'])
                )
                session.add(unit)
                session.flush()

            # 4. Annual Record check / insert (prevent duplicate unit-year combinations)
            existing_record = session.query(AnnualRecord).filter_by(
                unit_key=unit.unit_key,
                reporting_year=year
            ).first()

            if not existing_record:
                annual_rec = AnnualRecord(
                    unit_key=unit.unit_key,
                    dataset_id=dataset.dataset_id,
                    reporting_year=year,
                    operating_time=get_col(row, ['Operating Time', 'operatingTime']),
                    gross_load=get_col(row, ['Gross Load (MWh)', 'Gross Load (MW-h)', 'grossLoad']),
                    steam_load=get_col(row, ['Steam Load (1000 lb)', 'Steam Load (1000 lbs)', 'steamLoad']),
                    heat_input=get_col(row, ['Heat Input (mmBtu)', 'Heat Input (MMBtu)', 'heatInput']),
                    co2_mass=get_col(row, ['CO2 Mass (short tons)', 'CO2 (short tons)', 'co2Mass']),
                    so2_mass=get_col(row, ['SO2 Mass (short tons)', 'SO2 (short tons)', 'so2Mass']),
                    nox_mass=get_col(row, ['NOx Mass (short tons)', 'NOx (short tons)', 'noxMass']),
                    so2_control=get_col(row, ['SO2 Controls', 'SO2 Control Info']),
                    nox_control=get_col(row, ['NOx Controls', 'NOx Control Info']),
                    pm_control=get_col(row, ['PM Controls', 'PM Control Info']),
                    program_code=get_col(row, ['Program Code', 'Program Code(s)', 'programCode'])
                )
                session.add(annual_rec)
                accepted_count += 1
            else:
                skipped_duplicates += 1

            # Commit in batches of 500 for fast execution
            if accepted_count % 500 == 0:
                session.commit()

        # Update dataset counts and final commit
        dataset.accepted_records_count = accepted_count
        session.commit()

        print(f"\n Import Finished Successfully!")
        print(f"Total Raw Rows: {total_rows}")
        print(f"Accepted & Saved: {accepted_count}")
        print(f"Skipped Duplicates: {skipped_duplicates}")

    except Exception as e:
        session.rollback()
        print(f"\n Error during import: {e}")
        raise
    finally:
        session.close()

if __name__ == '__main__':
    # Make sure tables exist first
    Base.metadata.create_all(engine)
    
    # Run the import
    import_csv_to_mysql("campd_unit_data.csv")