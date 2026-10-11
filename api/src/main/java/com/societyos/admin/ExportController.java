package com.societyos.admin;

import com.societyos.common.AuditService;
import com.societyos.security.CurrentUser;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/** Customer-readable exports. CSV with a UTF-8 BOM opens directly in Excel. Every query is scoped to the caller's society. */
@RestController
@RequestMapping("/api/v1/export")
public class ExportController {

    private static final Map<String, String> QUERIES = Map.of(
        "flats", """
            SELECT b.name AS "Building", f.flat_number AS "Flat", f.floor_no AS "Floor", f.occupancy AS "Occupancy", f.owner_name AS "Owner",
                   f.owner_phone AS "Phone", f.owner_email AS "Email" FROM flat f JOIN building b ON b.id=f.building_id AND b.society_id=f.society_id
            WHERE f.society_id=? ORDER BY b.name, f.flat_number""",
        "receipts", """
            SELECT r.paid_on AS "Date", b.name AS "Building", f.flat_number AS "Flat", r.fund AS "Fund", r.period AS "Month", r.amount AS "Amount",
                   r.mode AS "Mode", r.reference AS "Reference", r.reversed AS "Reversed"
            FROM receipt r JOIN flat f ON f.id=r.flat_id AND f.society_id=r.society_id JOIN building b ON b.id=f.building_id AND b.society_id=f.society_id
            WHERE r.society_id=? ORDER BY r.paid_on""",
        "ledger", """
            SELECT l.entry_date AS "Date", l.entry_type AS "Type", l.category AS "Category", l.amount AS "Amount", l.description AS "Description",
                   l.mode AS "Mode", l.cheque_no AS "Cheque No", v.name AS "Vendor", l.reversed AS "Reversed"
            FROM ledger_entry l LEFT JOIN vendor v ON v.id=l.vendor_id AND v.society_id=l.society_id WHERE l.society_id=? ORDER BY l.entry_date, l.created_at""",
        "vendors", """
            SELECT v.name AS "Vendor", v.category AS "Category", v.phone AS "Phone", v.gst_no AS "GST",
              COALESCE((SELECT SUM(i.amount) FROM vendor_invoice i WHERE i.vendor_id=v.id AND i.society_id=v.society_id),0) AS "Invoiced",
              COALESCE((SELECT SUM(CASE WHEN l.entry_type='DEBIT' THEN l.amount ELSE -l.amount END) FROM ledger_entry l WHERE l.vendor_id=v.id AND l.society_id=v.society_id),0) AS "Paid"
            FROM vendor v WHERE v.society_id=? ORDER BY v.name""",
        "agreements", """
            SELECT b.name AS "Building", f.flat_number AS "Flat", a.tenant_name AS "Tenant", a.tenant_phone AS "Phone", a.start_date AS "Start",
                   a.end_date AS "End", a.rent AS "Rent", a.deposit AS "Deposit"
            FROM agreement a JOIN flat f ON f.id=a.flat_id AND f.society_id=a.society_id JOIN building b ON b.id=f.building_id AND b.society_id=f.society_id
            WHERE a.society_id=? ORDER BY a.end_date""",
        "attendance", """
            SELECT a.work_date AS "Date", s.name AS "Staff", s.role AS "Role", a.status AS "Status"
            FROM attendance_record a JOIN staff s ON s.id=a.staff_id AND s.society_id=a.society_id WHERE a.society_id=? ORDER BY a.work_date, s.name""",
        "audit", """
            SELECT e.created_at AS "When", COALESCE(u.full_name,'System') AS "User", e.action AS "Action", e.entity_type AS "Record", e.detail AS "Detail"
            FROM audit_event e LEFT JOIN app_user u ON u.id=e.user_id WHERE e.society_id=? ORDER BY e.created_at""");

    private final JdbcClient jdbc;
    private final AuditService audit;

    public ExportController(JdbcClient jdbc, AuditService audit) { this.jdbc = jdbc; this.audit = audit; }

    @GetMapping("/{module}.csv")
    @PreAuthorize("hasAnyRole('ADMIN','MANAGER')")
    public ResponseEntity<byte[]> export(@PathVariable String module) {
        String sql = QUERIES.get(module);
        if (sql == null) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Unknown export");
        var u = CurrentUser.get();
        List<List<Object>> rows = new ArrayList<>();
        List<String> header = new ArrayList<>();
        jdbc.sql(sql).param(u.societyId()).query(rs -> {
            var md = rs.getMetaData();
            if (header.isEmpty()) for (int i = 1; i <= md.getColumnCount(); i++) header.add(md.getColumnLabel(i));
            List<Object> r = new ArrayList<>();
            for (int i = 1; i <= md.getColumnCount(); i++) r.add(rs.getObject(i));
            rows.add(r);
        });
        StringBuilder sb = new StringBuilder("﻿");
        sb.append(String.join(",", header.stream().map(ExportController::cell).toList())).append("\r\n");
        for (var r : rows) sb.append(String.join(",", r.stream().map(ExportController::cell).toList())).append("\r\n");
        audit.record(u, "EXPORT", "EXPORT", module, rows.size() + " rows");
        return ResponseEntity.ok().contentType(new MediaType("text", "csv", StandardCharsets.UTF_8))
            .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename("shivranjan-" + module + ".csv").build().toString())
            .body(sb.toString().getBytes(StandardCharsets.UTF_8));
    }

    private static String cell(Object v) {
        if (v == null) return "";
        String s = v.toString();
        // Neutralise spreadsheet formula injection from user-entered text (not numbers/dates).
        if (v instanceof String && !s.isEmpty() && "=+-@\t\r".indexOf(s.charAt(0)) >= 0) s = "'" + s;
        if (s.contains(",") || s.contains("\"") || s.contains("\n") || s.contains("\r")) s = "\"" + s.replace("\"", "\"\"") + "\"";
        return s;
    }
}
