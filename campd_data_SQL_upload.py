import os
import pandas as pd
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

# Build a clean connection string directly for Pandas
CONN_STR = f"mysql+pymysql://{os.getenv('DB_USER','root')}:{os.getenv('DB_PASSWORD','')}@{os.getenv('DB_HOST','localhost')}:{os.getenv('DB_PORT','3306')}/{os.getenv('DB_NAME','epadata')}"

def import_csv_to_mysql(file_path: str):
    if not os.path.exists(file_path):
        return print(f"Error: File not found at {file_path}")

    # Load and Standardize Column Names Instantly
    print("Loading file...")
    df = pd.read_csv(file_path, low_memory=False)
    df.columns = [str(c).strip().lower().replace(' ', '_').replace('(', '').replace(')', '') for c in df.columns]
    
    # Standardize column variations to exact database field matches
    rename_rules = {
        'facility_id_orispl': 'epa_facility_id', 'facilityid': 'epa_facility_id', 'facility_id': 'epa_facility_id',
        'facilityname': 'facility_name', 'statecode': 'state', 'unitid': 'epa_unit_id', 'unit': 'epa_unit_id',
        'reporting_year': 'year'
    }
    df.rename(columns=rename_rules, inplace=True)
    df.dropna(subset=['epa_facility_id', 'epa_unit_id', 'year'], inplace=True)

    # Batch Save Metadata & Structural Dimension Tables
    print("Writing structural data...")
    
    # Log Dataset Run
    pd.DataFrame([{
        "dataset_name": "CAMPD Unit Ingest", "reporting_year": int(df['year'].iloc[0]),
        "retrieval_date": datetime.utcnow(), "raw_records_count": len(df)
    }]).to_sql('datasets', CONN_STR, if_exists='append', index=False)

    # Save Unique Facilities
    (df[['epa_facility_id', 'facility_name', 'state', 'county', 'latitude', 'longitude', 'source_category']]
     .drop_duplicates(subset=['epa_facility_id'])
     .to_sql('facilities', CONN_STR, if_exists='append', index=False))

    # Save Unique Units
    (df[['epa_facility_id', 'epa_unit_id', 'unit_type', 'primary_fuel_info', 'secondary_fuel_info']]
     .drop_duplicates(subset=['epa_facility_id', 'epa_unit_id'])
     .to_sql('units', CONN_STR, if_exists='append', index=False))

    # Stream Records
    print("Streaming performance metrics...")
    df.to_sql('annual_records', CONN_STR, if_exists='append', index=False, chunksize=2000)
    print("Done!")

if __name__ == '__main__':
    import_csv_to_mysql("campd_unit_data.csv")
