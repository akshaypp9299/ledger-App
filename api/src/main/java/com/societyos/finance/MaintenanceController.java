package com.societyos.finance;

import com.societyos.common.AuditService;
import com.societyos.security.CurrentUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
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
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/** Flat-wise Maintenance / Sinking / Repair charges and the receipts that pay them. */
@RestController
@RequestMapping("/api/v1")
public class MaintenanceController {

    public static final String PERIOD_RE = "^\\d{4}-(0[1-9]|1[0-2])$";
    static final List<String> FUNDS = List.of("MAINTENANCE", "SINKING", "REPAIR");

    public record GenerateRequest(@Pattern(regexp = PERIOD_RE, message = "use YYYY-MM") String period,
                                  @DecimalMin("0") BigDecimal maintenance, @DecimalMin("0") BigDecimal sinking, @DecimalMin("0") BigDecimal repair) {}
    public record ReceiptRequest(@NotNull UUID flatId,
                                 @Pattern(regexp = "MAINTENANCE|SINKING|REPAIR", message = "invalid fund") String fund,
                                 @Pattern(regexp = PERIOD_RE, message = "use YYYY-MM") String period,
                                 @NotNull @DecimalMin(value = "0.01", message = "must be greater than 0") BigDecimal amount,
                                 @NotNull LocalDate paidOn,
                                 @Pattern(regexp = "CASH|CHEQUE|UPI|BANK_TRANSFER", message = "invalid mode") String mode,
                                 @Size(max = 60) String reference, @Size(max = 300) String note) {}
    public record FundStatus(BigDecimal charged, BigDecimal paid, String status) {}
    public record FlatDues(UUID flatId, String building, String flatNumber, String ownerName, String occupancy,
                           Map<String, FundStatus> funds, BigDecimal due) {}
    public record Receipt(UUID id, String fund, String period, BigDecimal amount, LocalDate paidOn, String mode, String reference, String note, boolean reversed) {}
    public record Charge(String fund, String period, BigDecimal amount) {}

    private final JdbcClient jdbc;
    private final AuditService audit;
    private final LedgerService ledger;

    public MaintenanceController(JdbcClient jdbc, AuditService audit, LedgerService ledger) { this.jdbc = jdbc; this.audit = audit; this.ledger = ledger; }

    @PostMapping("/charges/generate")
    @PreAuthorize("hasAnyRole('ADMIN','MANAGER')")
    @Transactional
    public Map<String, Object> generate(@Valid @RequestBody GenerateRequest r) {
        var u = CurrentUser.get();
        Map<String, BigDecimal> amounts = Map.of("MAINTENANCE", nz(r.maintenance()), "SINKING", nz(r.sinking()), "REPAIR", nz(r.repair()));
        int created = 0;
        var flatIds = jdbc.sql("SELECT id FROM flat WHERE society_id = ?").param(u.societyId()).query((rs, i) -> rs.getObject("id", UUID.class)).list();
        for (String fund : FUNDS) {
            BigDecimal amt = amounts.get(fund);
            if (amt.signum() == 0) continue;
            for (UUID flatId : flatIds) {
                int exists = jdbc.sql("SELECT count(*) FROM charge WHERE society_id=? AND flat_id=? AND fund=? AND period=?")
                    .params(u.societyId(), flatId, fund, r.period()).query(Integer.class).single();
                if (exists > 0) continue;
                jdbc.sql("INSERT INTO charge (id, society_id, flat_id, fund, period, amount, created_at) VALUES (?,?,?,?,?,?,?)")
                    .params(UUID.randomUUID(), u.societyId(), flatId, fund, r.period(), amt, OffsetDateTime.now()).update();
                created++;
            }
        }
        audit.record(u, "GENERATE", "CHARGE", r.period(), created + " charges created");
        return Map.of("created", created);
    }

    @GetMapping("/maintenance")
    public List<FlatDues> dues(@RequestParam @Pattern(regexp = PERIOD_RE) String period) {
        var u = CurrentUser.get();
        var charges = jdbc.sql("SELECT flat_id, fund, amount FROM charge WHERE society_id=? AND period=?").params(u.societyId(), period)
            .query((rs, i) -> new Object[] {rs.getObject("flat_id", UUID.class), rs.getString("fund"), rs.getBigDecimal("amount")}).list();
        var paid = jdbc.sql("SELECT flat_id, fund, SUM(amount) AS total FROM receipt WHERE society_id=? AND period=? AND reversed=FALSE GROUP BY flat_id, fund")
            .params(u.societyId(), period)
            .query((rs, i) -> new Object[] {rs.getObject("flat_id", UUID.class), rs.getString("fund"), rs.getBigDecimal("total")}).list();
        Map<String, BigDecimal> chargedMap = new LinkedHashMap<>(), paidMap = new LinkedHashMap<>();
        charges.forEach(c -> chargedMap.put(c[0] + "|" + c[1], (BigDecimal) c[2]));
        paid.forEach(c -> paidMap.put(c[0] + "|" + c[1], (BigDecimal) c[2]));

        var flats = jdbc.sql("""
                SELECT f.id, b.name AS building, f.flat_number, f.owner_name, f.occupancy FROM flat f
                JOIN building b ON b.id=f.building_id AND b.society_id=f.society_id WHERE f.society_id=? ORDER BY b.name, f.flat_number""")
            .param(u.societyId()).query((rs, i) -> new Object[] {rs.getObject("id", UUID.class), rs.getString("building"), rs.getString("flat_number"),
                rs.getString("owner_name"), rs.getString("occupancy")}).list();
        List<FlatDues> out = new ArrayList<>();
        for (Object[] f : flats) {
            Map<String, FundStatus> funds = new LinkedHashMap<>();
            BigDecimal due = BigDecimal.ZERO;
            for (String fund : FUNDS) {
                BigDecimal ch = chargedMap.get(f[0] + "|" + fund);
                if (ch == null) { funds.put(fund, new FundStatus(null, BigDecimal.ZERO, "NONE")); continue; }
                BigDecimal pd = paidMap.getOrDefault(f[0] + "|" + fund, BigDecimal.ZERO);
                String status = pd.compareTo(ch) >= 0 ? "PAID" : pd.signum() > 0 ? "PARTIAL" : "UNPAID";
                funds.put(fund, new FundStatus(ch, pd, status));
                due = due.add(ch.subtract(pd).max(BigDecimal.ZERO));
            }
            out.add(new FlatDues((UUID) f[0], (String) f[1], (String) f[2], (String) f[3], (String) f[4], funds, due));
        }
        return out;
    }

    @GetMapping("/flats/{flatId}/statement")
    public Map<String, Object> statement(@PathVariable UUID flatId) {
        var u = CurrentUser.get();
        var charges = jdbc.sql("SELECT fund, period, amount FROM charge WHERE society_id=? AND flat_id=? ORDER BY period DESC, fund")
            .params(u.societyId(), flatId).query((rs, i) -> new Charge(rs.getString("fund"), rs.getString("period"), rs.getBigDecimal("amount"))).list();
        var receipts = jdbc.sql("SELECT id, fund, period, amount, paid_on, mode, reference, note, reversed FROM receipt WHERE society_id=? AND flat_id=? ORDER BY paid_on DESC, created_at DESC")
            .params(u.societyId(), flatId).query((rs, i) -> new Receipt(rs.getObject("id", UUID.class), rs.getString("fund"), rs.getString("period"),
                rs.getBigDecimal("amount"), rs.getObject("paid_on", LocalDate.class), rs.getString("mode"), rs.getString("reference"), rs.getString("note"), rs.getBoolean("reversed"))).list();
        return Map.of("charges", charges, "receipts", receipts);
    }

    @PostMapping("/receipts")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAnyRole('ADMIN','MANAGER')")
    @Transactional
    public Map<String, Object> record(@Valid @RequestBody ReceiptRequest r) {
        var u = CurrentUser.get();
        BigDecimal charged = jdbc.sql("SELECT amount FROM charge WHERE society_id=? AND flat_id=? AND fund=? AND period=?")
            .params(u.societyId(), r.flatId(), r.fund(), r.period()).query(BigDecimal.class).optional()
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "No charge for this flat/fund/month. Generate charges for " + r.period() + " first."));
        BigDecimal paid = jdbc.sql("SELECT COALESCE(SUM(amount),0) FROM receipt WHERE society_id=? AND flat_id=? AND fund=? AND period=? AND reversed=FALSE")
            .params(u.societyId(), r.flatId(), r.fund(), r.period()).query(BigDecimal.class).single();
        BigDecimal remaining = charged.subtract(paid);
        if (r.amount().compareTo(remaining) > 0)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Amount exceeds the balance due (" + remaining.toPlainString() + ")");

        UUID id = UUID.randomUUID();
        jdbc.sql("INSERT INTO receipt (id, society_id, flat_id, fund, period, amount, paid_on, mode, reference, note, reversed, created_by, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,FALSE,?,?)")
            .params(id, u.societyId(), r.flatId(), r.fund(), r.period(), r.amount(), r.paidOn(), r.mode() == null ? "CASH" : r.mode(), r.reference(), r.note(), u.userId(), OffsetDateTime.now()).update();
        String flatNo = jdbc.sql("SELECT b.name || '-' || f.flat_number FROM flat f JOIN building b ON b.id=f.building_id AND b.society_id=f.society_id WHERE f.id=? AND f.society_id=?").params(r.flatId(), u.societyId()).query(String.class).single();
        ledger.post(u, r.paidOn(), "CREDIT", r.fund().charAt(0) + r.fund().substring(1).toLowerCase() + " receipt", r.amount(),
            "Flat " + flatNo + " - " + r.period(), r.mode(), r.reference(), null, id, null);
        audit.record(u, "CREATE", "RECEIPT", id, "Flat " + flatNo + " " + r.fund() + " " + r.amount());
        return Map.of("id", id);
    }

    @PostMapping("/receipts/{id}/reverse")
    @PreAuthorize("hasAnyRole('ADMIN','MANAGER')")
    @Transactional
    public Map<String, Object> reverse(@PathVariable UUID id) {
        var u = CurrentUser.get();
        int n = jdbc.sql("UPDATE receipt SET reversed=TRUE WHERE id=? AND society_id=? AND reversed=FALSE").params(id, u.societyId()).update();
        if (n == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Receipt not found or already reversed");
        UUID entry = jdbc.sql("SELECT id FROM ledger_entry WHERE society_id=? AND receipt_id=? AND reversal_of_id IS NULL").params(u.societyId(), id)
            .query((rs, i) -> rs.getObject("id", UUID.class)).single();
        ledger.reverse(u, entry, "Receipt reversed");
        audit.record(u, "REVERSE", "RECEIPT", id, null);
        return Map.of("reversed", true);
    }

    private static BigDecimal nz(BigDecimal b) { return b == null ? BigDecimal.ZERO : b; }
}
