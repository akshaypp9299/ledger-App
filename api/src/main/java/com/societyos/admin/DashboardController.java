package com.societyos.admin;

import com.societyos.finance.MaintenanceController;
import com.societyos.security.CurrentUser;
import jakarta.validation.constraints.Pattern;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
public class DashboardController {

    public record Building(String name, int flats, BigDecimal charged, BigDecimal paid) {}
    public record Attention(String tone, String title, String meta, String to) {}

    private static String inr(BigDecimal n) {
        return "₹" + java.text.NumberFormat.getInstance(new java.util.Locale("en", "IN")).format(n.setScale(0, java.math.RoundingMode.HALF_UP));
    }

    private final JdbcClient jdbc;

    public DashboardController(JdbcClient jdbc) { this.jdbc = jdbc; }

    @GetMapping("/dashboard")
    public Map<String, Object> dashboard(@RequestParam @Pattern(regexp = MaintenanceController.PERIOD_RE) String period) {
        var u = CurrentUser.get();
        var s = u.societyId();
        YearMonth ym = YearMonth.parse(period);
        LocalDate from = ym.atDay(1), to = ym.plusMonths(1).atDay(1);

        BigDecimal expected = jdbc.sql("SELECT COALESCE(SUM(amount),0) FROM charge WHERE society_id=? AND period=?").params(s, period).query(BigDecimal.class).single();
        BigDecimal collected = jdbc.sql("SELECT COALESCE(SUM(amount),0) FROM receipt WHERE society_id=? AND period=? AND reversed=FALSE").params(s, period).query(BigDecimal.class).single();
        BigDecimal outstanding = expected.subtract(collected).max(BigDecimal.ZERO);
        BigDecimal base = jdbc.sql("SELECT opening_balance FROM society WHERE id=?").param(s).query(BigDecimal.class).single();
        BigDecimal cash = base.add(jdbc.sql("SELECT COALESCE(SUM(CASE WHEN entry_type='CREDIT' THEN amount ELSE -amount END),0) FROM ledger_entry WHERE society_id=?")
            .param(s).query(BigDecimal.class).single());
        var exp = jdbc.sql("SELECT COALESCE(SUM(amount),0), count(*) FROM ledger_entry WHERE society_id=? AND entry_type='DEBIT' AND reversal_of_id IS NULL AND reversed=FALSE AND entry_date >= ? AND entry_date < ?")
            .params(s, from, to).query((rs, i) -> new Object[] {rs.getBigDecimal(1), rs.getInt(2)}).single();
        int overdueFlats = jdbc.sql("""
                SELECT count(*) FROM (SELECT c.flat_id FROM charge c LEFT JOIN
                  (SELECT flat_id, fund, SUM(amount) AS p FROM receipt WHERE society_id=? AND period=? AND reversed=FALSE GROUP BY flat_id, fund) r
                  ON r.flat_id=c.flat_id AND r.fund=c.fund
                  WHERE c.society_id=? AND c.period=? AND c.amount > COALESCE(r.p,0) GROUP BY c.flat_id) t""")
            .params(s, period, s, period).query(Integer.class).single();

        var buildings = jdbc.sql("""
                SELECT b.name,
                  (SELECT count(*) FROM flat f WHERE f.building_id=b.id AND f.society_id=b.society_id) AS flats,
                  COALESCE((SELECT SUM(c.amount) FROM charge c JOIN flat f ON f.id=c.flat_id AND f.society_id=c.society_id WHERE f.building_id=b.id AND c.society_id=b.society_id AND c.period=?),0) AS charged,
                  COALESCE((SELECT SUM(r.amount) FROM receipt r JOIN flat f ON f.id=r.flat_id AND f.society_id=r.society_id WHERE f.building_id=b.id AND r.society_id=b.society_id AND r.period=? AND r.reversed=FALSE),0) AS paid
                FROM building b WHERE b.society_id=? ORDER BY b.name""")
            .params(period, period, s).query((rs, i) -> new Building(rs.getString("name"), rs.getInt("flats"), rs.getBigDecimal("charged"), rs.getBigDecimal("paid"))).list();

        LocalDate today = LocalDate.now();
        var expiring = jdbc.sql("""
                SELECT b.name, f.flat_number FROM agreement a JOIN flat f ON f.id=a.flat_id AND f.society_id=a.society_id JOIN building b ON b.id=f.building_id AND b.society_id=f.society_id
                WHERE a.society_id=? AND a.end_date >= ? AND a.end_date <= ? ORDER BY a.end_date""")
            .params(s, today, today.plusDays(30)).query((rs, i) -> rs.getString(1) + "-" + rs.getString(2)).list();
        BigDecimal vendorDue = jdbc.sql("""
                SELECT COALESCE(SUM(i.amount),0) - COALESCE((SELECT SUM(CASE WHEN l.entry_type='DEBIT' THEN l.amount ELSE -l.amount END) FROM ledger_entry l WHERE l.society_id=? AND l.vendor_id IS NOT NULL),0)
                FROM vendor_invoice i WHERE i.society_id=?""").params(s, s).query(BigDecimal.class).single();

        List<Attention> att = new ArrayList<>();
        if (!expiring.isEmpty()) att.add(new Attention("danger", expiring.size() + " tenancy agreement" + (expiring.size() > 1 ? "s" : "") + (expiring.size() > 1 ? " expire" : " expires") + " within 30 days", String.join(", ", expiring), "/tenants"));
        if (overdueFlats > 0) att.add(new Attention("warn", overdueFlats + " flat" + (overdueFlats > 1 ? "s have" : " has") + " pending maintenance", "Total outstanding " + inr(outstanding), "/maintenance"));
        if (expected.signum() == 0) att.add(new Attention("info", "No charges generated for " + period, "Generate monthly charges to start collecting", "/maintenance"));
        if (vendorDue.signum() > 0) att.add(new Attention("warn", "Vendor payments outstanding", inr(vendorDue) + " across vendors", "/vendors"));

        var activity = jdbc.sql("""
                SELECT COALESCE(u.full_name,'System') AS who, e.action, e.entity_type, e.detail, e.created_at
                FROM audit_event e LEFT JOIN app_user u ON u.id=e.user_id WHERE e.society_id=? ORDER BY e.created_at DESC LIMIT 6""")
            .param(s).query((rs, i) -> Map.of("who", rs.getString("who"), "action", rs.getString("action"), "entity", rs.getString("entity_type"),
                "detail", String.valueOf(rs.getString("detail") == null ? "" : rs.getString("detail")), "at", rs.getObject("created_at", java.time.OffsetDateTime.class).toString())).list();

        return Map.of("expected", expected, "collected", collected, "outstanding", outstanding, "cashBalance", cash, "expenses", exp[0], "expenseCount", exp[1],
            "overdueFlats", overdueFlats, "buildings", buildings, "attention", att, "activity", activity);
    }
}
