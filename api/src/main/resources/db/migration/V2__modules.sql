-- Portable SQL (PostgreSQL + H2 PostgreSQL mode).
ALTER TABLE society ADD COLUMN opening_balance NUMERIC(14,2) NOT NULL DEFAULT 0;

-- Maintenance: one charge per flat / fund / month. Receipts pay it down (partial payments allowed).
CREATE TABLE charge (
  id          UUID PRIMARY KEY,
  society_id  UUID NOT NULL REFERENCES society(id),
  flat_id     UUID NOT NULL,
  fund        VARCHAR(12) NOT NULL CHECK (fund IN ('MAINTENANCE','SINKING','REPAIR')),
  period      VARCHAR(7)  NOT NULL,
  amount      NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
  created_at  TIMESTAMP WITH TIME ZONE NOT NULL,
  CONSTRAINT uq_charge UNIQUE (society_id, flat_id, fund, period),
  CONSTRAINT fk_charge_flat FOREIGN KEY (society_id, flat_id) REFERENCES flat (society_id, id)
);

CREATE TABLE receipt (
  id          UUID PRIMARY KEY,
  society_id  UUID NOT NULL REFERENCES society(id),
  flat_id     UUID NOT NULL,
  fund        VARCHAR(12) NOT NULL CHECK (fund IN ('MAINTENANCE','SINKING','REPAIR')),
  period      VARCHAR(7)  NOT NULL,
  amount      NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  paid_on     DATE NOT NULL,
  mode        VARCHAR(20) NOT NULL,
  reference   VARCHAR(60),
  note        VARCHAR(300),
  reversed    BOOLEAN NOT NULL DEFAULT FALSE,
  created_by  UUID,
  created_at  TIMESTAMP WITH TIME ZONE NOT NULL,
  CONSTRAINT fk_receipt_flat FOREIGN KEY (society_id, flat_id) REFERENCES flat (society_id, id)
);
CREATE INDEX ix_receipt_flat ON receipt (society_id, flat_id, period);

CREATE TABLE vendor (
  id          UUID PRIMARY KEY,
  society_id  UUID NOT NULL REFERENCES society(id),
  name        VARCHAR(200) NOT NULL,
  category    VARCHAR(60),
  phone       VARCHAR(30),
  email       VARCHAR(200),
  gst_no      VARCHAR(20),
  notes       VARCHAR(500),
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMP WITH TIME ZONE NOT NULL,
  CONSTRAINT uq_vendor_tenant UNIQUE (society_id, id)
);

CREATE TABLE vendor_invoice (
  id           UUID PRIMARY KEY,
  society_id   UUID NOT NULL REFERENCES society(id),
  vendor_id    UUID NOT NULL,
  invoice_no   VARCHAR(40),
  invoice_date DATE NOT NULL,
  due_date     DATE,
  amount       NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  description  VARCHAR(300),
  created_at   TIMESTAMP WITH TIME ZONE NOT NULL,
  CONSTRAINT fk_invoice_vendor FOREIGN KEY (society_id, vendor_id) REFERENCES vendor (society_id, id)
);

-- Cashbook. Posted entries are never edited or deleted: corrections are reversal entries.
CREATE TABLE ledger_entry (
  id            UUID PRIMARY KEY,
  society_id    UUID NOT NULL REFERENCES society(id),
  entry_date    DATE NOT NULL,
  entry_type    VARCHAR(6) NOT NULL CHECK (entry_type IN ('CREDIT','DEBIT')),
  category      VARCHAR(60) NOT NULL,
  amount        NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  description   VARCHAR(300),
  mode          VARCHAR(20),
  cheque_no     VARCHAR(30),
  vendor_id     UUID,
  receipt_id    UUID,
  reversal_of_id UUID,
  reversed      BOOLEAN NOT NULL DEFAULT FALSE,
  created_by    UUID,
  created_at    TIMESTAMP WITH TIME ZONE NOT NULL,
  CONSTRAINT fk_ledger_vendor FOREIGN KEY (society_id, vendor_id) REFERENCES vendor (society_id, id)
);
CREATE INDEX ix_ledger_date ON ledger_entry (society_id, entry_date);

CREATE TABLE agreement (
  id           UUID PRIMARY KEY,
  society_id   UUID NOT NULL REFERENCES society(id),
  flat_id      UUID NOT NULL,
  tenant_name  VARCHAR(200) NOT NULL,
  tenant_phone VARCHAR(30),
  start_date   DATE NOT NULL,
  end_date     DATE NOT NULL,
  rent         NUMERIC(14,2),
  deposit      NUMERIC(14,2),
  notes        VARCHAR(500),
  created_at   TIMESTAMP WITH TIME ZONE NOT NULL,
  CONSTRAINT fk_agreement_flat FOREIGN KEY (society_id, flat_id) REFERENCES flat (society_id, id)
);

CREATE TABLE staff (
  id          UUID PRIMARY KEY,
  society_id  UUID NOT NULL REFERENCES society(id),
  name        VARCHAR(200) NOT NULL,
  role        VARCHAR(20) NOT NULL CHECK (role IN ('SECURITY','HOUSEKEEPING','OTHER')),
  shift       VARCHAR(30),
  phone       VARCHAR(30),
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT uq_staff_tenant UNIQUE (society_id, id)
);

CREATE TABLE attendance_record (
  id          UUID PRIMARY KEY,
  society_id  UUID NOT NULL REFERENCES society(id),
  staff_id    UUID NOT NULL,
  work_date   DATE NOT NULL,
  status      VARCHAR(10) NOT NULL CHECK (status IN ('PRESENT','ABSENT','LEAVE')),
  note        VARCHAR(200),
  CONSTRAINT uq_attendance UNIQUE (society_id, staff_id, work_date),
  CONSTRAINT fk_attendance_staff FOREIGN KEY (society_id, staff_id) REFERENCES staff (society_id, id)
);

CREATE TABLE notice (
  id          UUID PRIMARY KEY,
  society_id  UUID NOT NULL REFERENCES society(id),
  title       VARCHAR(200) NOT NULL,
  body        VARCHAR(4000) NOT NULL,
  priority    VARCHAR(10) NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('LOW','NORMAL','HIGH')),
  created_by  UUID,
  created_at  TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE TABLE document (
  id           UUID PRIMARY KEY,
  society_id   UUID NOT NULL REFERENCES society(id),
  title        VARCHAR(200) NOT NULL,
  category     VARCHAR(40) NOT NULL,
  flat_id      UUID,
  filename     VARCHAR(255) NOT NULL,
  content_type VARCHAR(100) NOT NULL,
  size_bytes   BIGINT NOT NULL,
  storage_key  VARCHAR(100) NOT NULL,
  uploaded_by  UUID,
  created_at   TIMESTAMP WITH TIME ZONE NOT NULL,
  CONSTRAINT fk_document_flat FOREIGN KEY (society_id, flat_id) REFERENCES flat (society_id, id)
);

CREATE TABLE emergency_contact (
  id          UUID PRIMARY KEY,
  society_id  UUID NOT NULL REFERENCES society(id),
  name        VARCHAR(200) NOT NULL,
  role        VARCHAR(100),
  phone       VARCHAR(30) NOT NULL,
  note        VARCHAR(200)
);
