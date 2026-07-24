-- Audit ledger for AegisAgent.
--
-- Every decision the gateway makes -- allowed or denied -- is appended here as one
-- row. Rows are never updated or deleted; the ledger is append-only by convention.
--
-- Tamper-evidence comes from the hash chain: each row stores the hash of the row
-- before it, so altering any historical row changes its own hash and breaks the
-- link every later row depends on. Detecting tampering therefore does not require
-- trusting the database -- anyone holding the rows can recompute the chain. See
-- ledger/verify_chain.py.
--
-- The hash preimage is exactly:
--     sha256(prev_hash || canonical_payload)
-- where canonical_payload is compact JSON with sorted keys and no whitespace:
--     {"action":...,"agent_id":...,"agent_role":...,"allowed":...,
--      "amount":"0.00","deny_reason":...,"ts":...}
-- amount is always rendered to exactly two decimal places, and ts is an ISO-8601
-- UTC timestamp, so the payload is reproducible from the stored row alone.
--
-- The first row's prev_hash is the genesis value: 64 zeros.

CREATE TABLE IF NOT EXISTS audit_log (
    id          BIGSERIAL     PRIMARY KEY,
    ts          TIMESTAMPTZ   NOT NULL,
    agent_id    TEXT          NOT NULL,
    agent_role  TEXT          NOT NULL,
    action      TEXT          NOT NULL,
    amount      NUMERIC(20,2) NOT NULL,
    allowed     BOOLEAN       NOT NULL,
    deny_reason TEXT,
    prev_hash   TEXT          NOT NULL,
    hash        TEXT          NOT NULL UNIQUE
);

-- The operator console reads the ledger newest-first, and filters by agent when
-- drilling into a single agent's history.
CREATE INDEX IF NOT EXISTS audit_log_ts_idx ON audit_log (ts DESC);
CREATE INDEX IF NOT EXISTS audit_log_agent_id_ts_idx ON audit_log (agent_id, ts DESC);
