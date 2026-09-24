-- Phase 2 relational configuration schema.
-- High-volume readings, predictions, alerts, and audit events remain in DynamoDB.

CREATE TABLE schools (
  school_id VARCHAR(128) PRIMARY KEY,
  school_name VARCHAR(255) NOT NULL,
  location_reference VARCHAR(255) NOT NULL,
  latitude DECIMAL(9, 6) NOT NULL,
  longitude DECIMAL(9, 6) NOT NULL,
  child_count INTEGER NOT NULL CHECK (child_count >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE contacts (
  contact_id VARCHAR(128) PRIMARY KEY,
  school_id VARCHAR(128) NOT NULL REFERENCES schools(school_id),
  name VARCHAR(255) NOT NULL,
  contact_type VARCHAR(32) NOT NULL CHECK (
    contact_type IN ('schoolAdministrator', 'schoolStaff', 'parentGuardian', 'escalation')
  ),
  channel VARCHAR(32) NOT NULL,
  destination_secret_ref VARCHAR(512) NOT NULL,
  institution_verified BOOLEAN NOT NULL DEFAULT FALSE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE school_policies (
  school_id VARCHAR(128) PRIMARY KEY REFERENCES schools(school_id),
  policy_version VARCHAR(64) NOT NULL,
  pm25_watch DECIMAL(10, 2) NOT NULL,
  pm25_high DECIMAL(10, 2) NOT NULL,
  pm25_critical DECIMAL(10, 2) NOT NULL,
  pm10_watch DECIMAL(10, 2) NOT NULL,
  pm10_high DECIMAL(10, 2) NOT NULL,
  pm10_critical DECIMAL(10, 2) NOT NULL,
  minimum_prediction_confidence DECIMAL(4, 3) NOT NULL,
  child_sensitive_mode BOOLEAN NOT NULL DEFAULT TRUE,
  protective_action_policy JSONB NOT NULL,
  notification_settings JSONB NOT NULL,
  escalation_settings JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
