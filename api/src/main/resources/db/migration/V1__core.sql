-- Portable SQL: runs on PostgreSQL and on H2 (PostgreSQL mode). No vendor-specific types.
CREATE TABLE society (
  id          UUID PRIMARY KEY,
  name        VARCHAR(200) NOT NULL,
  address     VARCHAR(500),
  created_at  TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE TABLE app_user (
  id            UUID PRIMARY KEY,
  society_id    UUID NOT NULL REFERENCES society(id),
  email         VARCHAR(200) NOT NULL,
  full_name     VARCHAR(200) NOT NULL,
  password_hash VARCHAR(100) NOT NULL,
  role          VARCHAR(20)  NOT NULL CHECK (role IN ('ADMIN','MANAGER','VIEWER')),
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMP WITH TIME ZONE NOT NULL,
  CONSTRAINT uq_user_email UNIQUE (email)
);

CREATE TABLE building (
  id          UUID PRIMARY KEY,
  society_id  UUID NOT NULL REFERENCES society(id),
  name        VARCHAR(50) NOT NULL,
  CONSTRAINT uq_building_name UNIQUE (society_id, name),
  CONSTRAINT uq_building_tenant UNIQUE (society_id, id)
);

CREATE TABLE flat (
  id            UUID PRIMARY KEY,
  society_id    UUID NOT NULL REFERENCES society(id),
  building_id   UUID NOT NULL,
  flat_number   VARCHAR(20) NOT NULL,
  floor_no      INTEGER,
  area_sqft     NUMERIC(8,2),
  occupancy     VARCHAR(10) NOT NULL DEFAULT 'OWNER' CHECK (occupancy IN ('OWNER','TENANT','VACANT')),
  owner_name    VARCHAR(200) NOT NULL,
  owner_phone   VARCHAR(30),
  owner_email   VARCHAR(200),
  created_at    TIMESTAMP WITH TIME ZONE NOT NULL,
  CONSTRAINT uq_flat_number UNIQUE (society_id, building_id, flat_number),
  CONSTRAINT uq_flat_tenant UNIQUE (society_id, id),
  -- composite FK: a flat can only point to a building of the SAME society
  CONSTRAINT fk_flat_building FOREIGN KEY (society_id, building_id) REFERENCES building (society_id, id)
);

CREATE TABLE audit_event (
  id          UUID PRIMARY KEY,
  society_id  UUID NOT NULL REFERENCES society(id),
  user_id     UUID,
  action      VARCHAR(40) NOT NULL,
  entity_type VARCHAR(40) NOT NULL,
  entity_id   VARCHAR(64),
  detail      VARCHAR(1000),
  created_at  TIMESTAMP WITH TIME ZONE NOT NULL
);
CREATE INDEX ix_audit_society_time ON audit_event (society_id, created_at);
