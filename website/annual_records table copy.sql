CREATE TABLE `annual_records` (
  `record_id` INT NOT NULL AUTO_INCREMENT,
  `unit_key` INT NOT NULL,
  `dataset_id` INT NOT NULL,
  `reporting_year` INT NOT NULL,
  `operating_time` FLOAT DEFAULT NULL,
  `gross_load` FLOAT DEFAULT NULL,
  `steam_load` FLOAT DEFAULT NULL,
  `heat_input` FLOAT DEFAULT NULL,
  `co2_mass` FLOAT DEFAULT NULL,
  `so2_mass` FLOAT DEFAULT NULL,
  `nox_mass` FLOAT DEFAULT NULL,
  `so2_control` VARCHAR(100) DEFAULT NULL,
  `nox_control` VARCHAR(100) DEFAULT NULL,
  `pm_control` VARCHAR(100) DEFAULT NULL,
  `program_code` VARCHAR(50) DEFAULT NULL,
  
  PRIMARY KEY (`record_id`),
  UNIQUE KEY `uq_unit_year` (`unit_key`, `reporting_year`),
  
  KEY `dataset_id` (`dataset_id`),
  KEY `ix_annual_records_co2_mass` (`co2_mass`),
  KEY `ix_annual_records_reporting_year` (`reporting_year`),
  KEY `ix_annual_records_so2_mass` (`so2_mass`),
  KEY `ix_annual_records_nox_mass` (`nox_mass`),
  
  CONSTRAINT `annual_records_ibfk_1` FOREIGN KEY (`unit_key`) REFERENCES `units` (`unit_key`),
  CONSTRAINT `annual_records_ibfk_2` FOREIGN KEY (`dataset_id`) REFERENCES `datasets` (`dataset_id`)
) ENGINE=InnoDB AUTO_INCREMENT=441 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
