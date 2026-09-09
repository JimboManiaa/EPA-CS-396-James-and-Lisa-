import os
from datetime import datetime
from dotenv import load_dotenv
from sqlalchemy import (
    create_engine, Column, Integer, String, Float, 
    DateTime, ForeignKey, UniqueConstraint, Text, Date
)
from sqlalchemy.orm import declarative_base, relationship, sessionmaker

load_dotenv()

USER = os.getenv("DB_USER", "root")
PWD = os.getenv("DB_PASSWORD", "")
HOST = os.getenv("DB_HOST", "localhost")
PORT = os.getenv("DB_PORT", "3306")
DB_NAME = os.getenv("DB_NAME", "epadata")

DATABASE_URL = f"mysql+pymysql://{USER}:{PWD}@{HOST}:{PORT}/{DB_NAME}"

engine = create_engine(DATABASE_URL, echo=False)
SessionLocal = sessionmaker(bind=engine)
Base = declarative_base()

class Dataset(Base):
    __tablename__ = 'datasets'

    dataset_id = Column(Integer, primary_key=True, autoincrement=True)
    dataset_name = Column(String(120), nullable=False)
    data_source = Column(String(50), nullable=False)
    reporting_year = Column(Integer, nullable=False, index=True)
    retrieval_date = Column(DateTime, default=datetime.utcnow)
    original_filename = Column(String(255))
    raw_records_count = Column(Integer, default=0)
    accepted_records_count = Column(Integer, default=0)
    notes = Column(Text)

    annual_records = relationship('AnnualRecord', back_populates='dataset')


class Facility(Base):
    __tablename__ = 'facilities'

    epa_facility_id = Column(Integer, primary_key=True)
    facility_name = Column(String(200), nullable=False, index=True)
    state = Column(String(2), nullable=False, index=True)
    county = Column(String(100))
    latitude = Column(Float)
    longitude = Column(Float)
    source_category = Column(String(100))

    units = relationship('Unit', back_populates='facility')


class Unit(Base):
    __tablename__ = 'units'

    unit_key = Column(Integer, primary_key=True, autoincrement=True)
    epa_facility_id = Column(Integer, ForeignKey('facilities.epa_facility_id'), nullable=False)
    epa_unit_id = Column(String(50), nullable=False)
    unit_type = Column(String(100))
    primary_fuel = Column(String(50), index=True)
    secondary_fuel = Column(String(50))
    operating_date = Column(Date)
    retirement_date = Column(Date)

    facility = relationship('Facility', back_populates='units')
    annual_records = relationship('AnnualRecord', back_populates='unit')

    __table_args__ = (
        UniqueConstraint('epa_facility_id', 'epa_unit_id', name='uq_facility_unit'),
    )


class AnnualRecord(Base):
    __tablename__ = 'annual_records'

    record_id = Column(Integer, primary_key=True, autoincrement=True)
    unit_key = Column(Integer, ForeignKey('units.unit_key'), nullable=False)
    dataset_id = Column(Integer, ForeignKey('datasets.dataset_id'), nullable=False)
    reporting_year = Column(Integer, nullable=False, index=True)
    operating_time = Column(Float)
    gross_load = Column(Float)
    steam_load = Column(Float)
    heat_input = Column(Float)
    co2_mass = Column(Float, index=True)
    so2_mass = Column(Float, index=True)
    nox_mass = Column(Float, index=True)
    so2_control = Column(String(100))
    nox_control = Column(String(100))
    pm_control = Column(String(100))
    program_code = Column(String(50))

    unit = relationship('Unit', back_populates='annual_records')
    dataset = relationship('Dataset', back_populates='annual_records')

    __table_args__ = (
        UniqueConstraint('unit_key', 'reporting_year', name='uq_unit_year'),
    )