package com.societyos.finance;

import com.societyos.common.AuditService;
import com.societyos.security.CurrentUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
public class LedgerController {

    public record EntryRequest(@NotNull LocalDate entryDate,
                               @Pattern(regexp = "CREDIT|DEBIT", message = "must be CREDIT or DEBIT") String type,
                               @NotBlank @Size(max = 60) String category,
                               @NotNull @DecimalMin(value = "0.01", message = "must be greater than 0") BigDecimal amount,
                               @Size(max = 300) String description,
                               @Pattern(regexp = "CASH|CHEQUE|UPI|BANK_TRANSFER", message = "invalid mode") String mode,
                               @Size(max = 30) String chequeNo, UUID vendorId) {}
    public record ReverseRequest(@Size(max = 300) String reason) {}
    public record OpeningRequest(@NotNull BigDecimal openingBalance) {}
    public record Entry(UUID id, LocalDate entryDate, String type, String category, BigDecimal amount, String description, String mode,
                        String chequeNo, UUID vendorId, String vendorName, boolean receiptLinked, boolean reversal, boolean reversed) {}

    private final JdbcClient jdbc;
    private final AuditService audit;
    private final LedgerService ledger;

    public LedgerController(JdbcClient jdbc, AuditService audit, LedgerService ledger) { this.jdbc = jdbc; this.audit = audit; this.ledger = ledger; }

    @GetMapping("/ledger")
    public Map<String, Object> month(@RequestParam @Pattern(regexp = MaintenanceController.PERIOD_RE) String month) {
        var u = CurrentUser.get();
        LocalDate from = YearMonth.parse(month).atDay(1), to = YearMonth.parse(month).plusMonths(1).atDay(1);
        BigDecimal base = jdbc.sql("SELECT opening_balance FROM society WHERE id=?").param(u.societyId()).query(BigDecimal.class).single();
        BigDecimal before = jdbc.sql("SELECT COALESCE(SUM(CASE WHEN entry_type='CREDIT' THEN amount ELSE -amount END),0) FROM ledger_entry WHERE society_id=? AND entry_date < ?")
            .params(u.societyId(), from).query(BigDecimal.class).single();
        var entries = jdbc.sql("""
                SELECT l.id, l.entry_date, l.entry_type, l.category, l.amount, l.description, l.mode, l.cheque_no, l.vendor_id, v.name AS vendor_name,
                       l.receipt_id, l.reversal_of_id, l.reversed
                FROM ledger_entry l LEFT JOIN vendor v ON v.id = l.vendor_id AND v.society_id = l.society_id
                WHERE l.society_id=? AND l.entry_date >= ? AND l.entry_date < ? ORDER BY l.entry_date, l.created_at""")
            .params(u.societyId(), from, to).query((rs, i) -> new Entry(rs.getObject("id", UUID.class), rs.getObject("entry_date", LocalDate.class),
                rs.getString("entry_type"), rs.getString("category"), rs.getBigDecimal("amount"), rs.getString("description"), rs.getString("mode"),
                rs.getString("cheque_no"), rs.getObject("vendor_id", UUID.class), rs.getString("vendor_name"), rs.getObject("receipt_id") != null,
                rs.getObject("reversal_of_id") != null, rs.getBoolean("reversed"))).list();
        BigDecimal credits = BigDecimal.ZERO, debits = BigDecimal.ZERO;
        for (Entry e : entries) { if (e.type().equals("CREDIT")) credits = credits.add(e.amount()); else debits = debits.add(e.amount()); }
        BigDecimal opening = base.add(before);
        return Map.of("openingBalance", opening, "credits", credits, "debits", debits, "closingBalance", opening.add(credits).subtract(debits), "entries", entries);
    }

    @PostMapping("/ledger")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAnyRole('ADMIN','MANAGER')")
    public Map<String, Object> add(@Valid @RequestBody EntryRequest r) {
        var u = CurrentUser.get();
        if (r.vendorId() != null) {
            int n = jdbc.sql("SELECT count(*) FROM vendor WHERE id=? AND society_id=?").params(r.vendorId(), u.societyId()).query(Integer.class).single();
            if (n == 0) throw new org.springframework.web.server.ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown vendor");
        }
        UUID id = ledger.post(u, r.entryDate(), r.type(), r.category().trim(), r.amount(), r.description(), r.mode(), r.chequeNo(), r.vendorId(), null, null);
        audit.record(u, "CREATE", "LEDGER", id, r.type() + " " + r.amount() + " " + r.category());
        return Map.of("id", id);
    }

    @PostMapping("/ledger/{id}/reverse")
    @PreAuthorize("hasAnyRole('ADMIN','MANAGER')")
    @Transactional
    public Map<String, Object> reverse(@PathVariable UUID id, @Valid @RequestBody(required = false) ReverseRequest r) {
        var u = CurrentUser.get();
        boolean linked = jdbc.sql("SELECT count(*) FROM ledger_entry WHERE id=? AND society_id=? AND receipt_id IS NOT NULL").params(id, u.societyId()).query(Integer.class).single() > 0;
        if (linked) throw new org.springframework.web.server.ResponseStatusException(HttpStatus.BAD_REQUEST, "This entry belongs to a flat receipt. Reverse the receipt instead.");
        UUID rev = ledger.reverse(u, id, r == null || r.reason() == null ? "Reversed" : r.reason());
        audit.record(u, "REVERSE", "LEDGER", id, r == null ? null : r.reason());
        return Map.of("reversalId", rev);
    }

    @PutMapping("/society/opening-balance")
    @PreAuthorize("hasRole('ADMIN')")
    public Map<String, Object> opening(@Valid @RequestBody OpeningRequest r) {
        var u = CurrentUser.get();
        jdbc.sql("UPDATE society SET opening_balance=? WHERE id=?").params(r.openingBalance(), u.societyId()).update();
        audit.record(u, "UPDATE", "SOCIETY", u.societyId(), "opening balance " + r.openingBalance());
        return Map.of("openingBalance", r.openingBalance());
    }

    @GetMapping("/ledger/categories")
    public List<String> categories() {
        return List.of("Salary & wages", "Housekeeping", "Security", "Electricity", "Water / Tanker", "Repairs & maintenance", "Lift / Generator",
            "Pest control", "Stationery & office", "Legal & audit", "Insurance", "Festival & events", "Miscellaneous", "Other income", "Donation");
    }
}
