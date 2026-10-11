package com.societyos.common;

import com.societyos.security.CurrentUser;
import java.time.OffsetDateTime;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

/** Every write goes through here so "who did what, when" is always recorded. */
@Service
public class AuditService {
    private final JdbcClient jdbc;

    public AuditService(JdbcClient jdbc) { this.jdbc = jdbc; }

    public void record(CurrentUser u, String action, String entityType, Object entityId, String detail) {
        jdbc.sql("INSERT INTO audit_event (id, society_id, user_id, action, entity_type, entity_id, detail, created_at) VALUES (?,?,?,?,?,?,?,?)")
            .params(UUID.randomUUID(), u.societyId(), u.userId(), action, entityType, entityId == null ? null : entityId.toString(),
                detail == null ? null : detail.substring(0, Math.min(detail.length(), 1000)), OffsetDateTime.now())
            .update();
    }
}
