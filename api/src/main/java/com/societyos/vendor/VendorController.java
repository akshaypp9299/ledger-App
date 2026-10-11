package com.societyos.vendor;

import com.societyos.common.AuditService;
import com.societyos.finance.LedgerService;
import com.societyos.security.CurrentUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1/vendors")
public class VendorController {

    public record VendorRequest(@NotBlank @Size(max = 200) String name, @Size(max = 60) String category, @Size(max = 30) String phone,
                                @Size(max = 200) String email, @Size(max = 20) String gstNo, @Size(max = 500) String notes) {}
    public record InvoiceRequest(@Size(max = 40) String invoiceNo, @NotNull LocalDate invoiceDate, LocalDate dueDate,
                                 @NotNull @DecimalMin(value = "0.01", message = "must be greater than 0") BigDecimal amount, @Size(max = 300) String description) {}
    public record PaymentRequest(@NotNull LocalDate paidOn, @NotNull @DecimalMin(value = "0.01", message = "must be greater than 0") BigDecimal amount,
                                 @Pattern(regexp = "CASH|CHEQUE|UPI|BANK_TRANSFER", message = "invalid mode") String mode,
                                 @Size(max = 30) String chequeNo, @Size(max = 300) String note) {}
    public record Vendor(UUID id, String name, String category, String phone, String email, String gstNo, String notes,
                         BigDecimal invoiced, BigDecimal paid, BigDecimal outstanding) {}

    public record InvoiceRow(UUID id, String invoiceNo, LocalDate invoiceDate, LocalDate dueDate, BigDecimal amount, String description) {}
    public record PaymentRow(UUID id, LocalDate date, String type, BigDecimal amount, String mode, String chequeNo, String description, boolean reversed) {}

    private static final String SELECT = """
        SELECT v.id, v.name, v.category, v.phone, v.email, v.gst_no, v.notes,
          COALESCE((SELECT SUM(i.amount) FROM vendor_invoice i WHERE i.vendor_id=v.id AND i.society_id=v.society_id),0) AS invoiced,
          COALESCE((SELECT SUM(CASE WHEN l.entry_type='DEBIT' THEN l.amount ELSE -l.amount END) FROM ledger_entry l WHERE l.vendor_id=v.id AND l.society_id=v.society_id),0) AS paid
        FROM vendor v WHERE v.society_id=? AND v.active=TRUE""";

    private final JdbcClient jdbc;
    private final AuditService audit;
    private final LedgerService ledger;

    public VendorController(JdbcClient jdbc, AuditService audit, LedgerService ledger) { this.jdbc = jdbc; this.audit = audit; this.ledger = ledger; }

    private static Vendor map(java.sql.ResultSet rs) throws java.sql.SQLException {
        BigDecimal inv = rs.getBigDecimal("invoiced"), paid = rs.getBigDecimal("paid");
        return new Vendor(rs.getObject("id", UUID.class), rs.getString("name"), rs.getString("category"), rs.getString("phone"), rs.getString("email"),
            rs.getString("gst_no"), rs.getString("notes"), inv, paid, inv.subtract(paid));
    }

    @GetMapping
    public List<Vendor> list() {
        return jdbc.sql(SELECT + " ORDER BY v.name").param(CurrentUser.get().societyId()).query((rs, i) -> map(rs)).list();
    }

    @GetMapping("/{id}")
    public Map<String, Object> get(@PathVariable UUID id) {
        var u = CurrentUser.get();
        Vendor v = jdbc.sql(SELECT + " AND v.id=?").params(u.societyId(), id).query((rs, i) -> map(rs)).optional()
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Vendor not found"));
        var invoices = jdbc.sql("SELECT id, invoice_no, invoice_date, due_date, amount, description FROM vendor_invoice WHERE vendor_id=? AND society_id=? ORDER BY invoice_date DESC")
            .params(id, u.societyId()).query((rs, i) -> new InvoiceRow(rs.getObject("id", UUID.class), rs.getString("invoice_no"), rs.getObject("invoice_date", LocalDate.class),
                rs.getObject("due_date", LocalDate.class), rs.getBigDecimal("amount"), rs.getString("description"))).list();
        var payments = jdbc.sql("SELECT id, entry_date, entry_type, amount, mode, cheque_no, description, reversed FROM ledger_entry WHERE vendor_id=? AND society_id=? ORDER BY entry_date DESC, created_at DESC")
            .params(id, u.societyId()).query((rs, i) -> new PaymentRow(rs.getObject("id", UUID.class), rs.getObject("entry_date", LocalDate.class), rs.getString("entry_type"),
                rs.getBigDecimal("amount"), rs.getString("mode"), rs.getString("cheque_no"), rs.getString("description"), rs.getBoolean("reversed"))).list();
        return Map.of("vendor", v, "invoices", invoices, "payments", payments);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAnyRole('ADMIN','MANAGER')")
    public Map<String, Object> create(@Valid @RequestBody VendorRequest r) {
        var u = CurrentUser.get();
        UUID id = UUID.randomUUID();
        jdbc.sql("INSERT INTO vendor (id, society_id, name, category, phone, email, gst_no, notes, active, created_at) VALUES (?,?,?,?,?,?,?,?,TRUE,?)")
            .params(id, u.societyId(), r.name().trim(), r.category(), r.phone(), r.email(), r.gstNo(), r.notes(), OffsetDateTime.now()).update();
        audit.record(u, "CREATE", "VENDOR", id, r.name());
        return Map.of("id", id);
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN','MANAGER')")
    public Map<String, Object> update(@PathVariable UUID id, @Valid @RequestBody VendorRequest r) {
        var u = CurrentUser.get();
        int n = jdbc.sql("UPDATE vendor SET name=?, category=?, phone=?, email=?, gst_no=?, notes=? WHERE id=? AND society_id=?")
            .params(r.name().trim(), r.category(), r.phone(), r.email(), r.gstNo(), r.notes(), id, u.societyId()).update();
        if (n == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Vendor not found");
        audit.record(u, "UPDATE", "VENDOR", id, r.name());
        return Map.of("id", id);
    }

    @PostMapping("/{id}/invoices")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAnyRole('ADMIN','MANAGER')")
    public Map<String, Object> invoice(@PathVariable UUID id, @Valid @RequestBody InvoiceRequest r) {
        var u = CurrentUser.get();
        requireVendor(u, id);
        UUID inv = UUID.randomUUID();
        jdbc.sql("INSERT INTO vendor_invoice (id, society_id, vendor_id, invoice_no, invoice_date, due_date, amount, description, created_at) VALUES (?,?,?,?,?,?,?,?,?)")
            .params(inv, u.societyId(), id, r.invoiceNo(), r.invoiceDate(), r.dueDate(), r.amount(), r.description(), OffsetDateTime.now()).update();
        audit.record(u, "CREATE", "VENDOR_INVOICE", inv, r.amount().toPlainString());
        return Map.of("id", inv);
    }

    /** A vendor payment is a cashbook DEBIT linked to the vendor, so the books and the vendor statement can never disagree. */
    @PostMapping("/{id}/payments")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAnyRole('ADMIN','MANAGER')")
    public Map<String, Object> pay(@PathVariable UUID id, @Valid @RequestBody PaymentRequest r) {
        var u = CurrentUser.get();
        String name = requireVendor(u, id);
        UUID entry = ledger.post(u, r.paidOn(), "DEBIT", "Vendor payment", r.amount(), r.note() == null || r.note().isBlank() ? "Paid to " + name : r.note(),
            r.mode() == null ? "CASH" : r.mode(), r.chequeNo(), id, null, null);
        audit.record(u, "CREATE", "VENDOR_PAYMENT", entry, name + " " + r.amount());
        return Map.of("id", entry);
    }

    private String requireVendor(CurrentUser u, UUID id) {
        return jdbc.sql("SELECT name FROM vendor WHERE id=? AND society_id=?").params(id, u.societyId()).query(String.class).optional()
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Vendor not found"));
    }
}
