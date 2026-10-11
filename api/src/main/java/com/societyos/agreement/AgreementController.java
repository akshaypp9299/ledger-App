package com.societyos.agreement;

import com.societyos.common.AuditService;
import com.societyos.security.CurrentUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
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
@RequestMapping("/api/v1/agreements")
public class AgreementController {

    public record Request(@NotNull UUID flatId, @NotBlank @Size(max = 200) String tenantName, @Size(max = 30) String tenantPhone,
                          @NotNull LocalDate startDate, @NotNull LocalDate endDate, BigDecimal rent, BigDecimal deposit, @Size(max = 500) String notes) {}
    public record Agreement(UUID id, UUID flatId, String building, String flatNumber, String tenantName, String tenantPhone, LocalDate startDate,
                            LocalDate endDate, BigDecimal rent, BigDecimal deposit, String notes, long daysLeft) {}

    private static final String SELECT = """
        SELECT a.id, a.flat_id, b.name AS building, f.flat_number, a.tenant_name, a.tenant_phone, a.start_date, a.end_date, a.rent, a.deposit, a.notes
        FROM agreement a JOIN flat f ON f.id=a.flat_id AND f.society_id=a.society_id JOIN building b ON b.id=f.building_id AND b.society_id=f.society_id
        WHERE a.society_id=?""";

    private final JdbcClient jdbc;
    private final AuditService audit;

    public AgreementController(JdbcClient jdbc, AuditService audit) { this.jdbc = jdbc; this.audit = audit; }

    private static Agreement map(java.sql.ResultSet rs) throws java.sql.SQLException {
        LocalDate end = rs.getObject("end_date", LocalDate.class);
        return new Agreement(rs.getObject("id", UUID.class), rs.getObject("flat_id", UUID.class), rs.getString("building"), rs.getString("flat_number"),
            rs.getString("tenant_name"), rs.getString("tenant_phone"), rs.getObject("start_date", LocalDate.class), end, rs.getBigDecimal("rent"),
            rs.getBigDecimal("deposit"), rs.getString("notes"), ChronoUnit.DAYS.between(LocalDate.now(), end));
    }

    @GetMapping
    public List<Agreement> list() {
        return jdbc.sql(SELECT + " ORDER BY a.end_date").param(CurrentUser.get().societyId()).query((rs, i) -> map(rs)).list();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAnyRole('ADMIN','MANAGER')")
    public Agreement create(@Valid @RequestBody Request r) {
        var u = CurrentUser.get();
        check(u, r);
        UUID id = UUID.randomUUID();
        jdbc.sql("INSERT INTO agreement (id, society_id, flat_id, tenant_name, tenant_phone, start_date, end_date, rent, deposit, notes, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
            .params(id, u.societyId(), r.flatId(), r.tenantName().trim(), r.tenantPhone(), r.startDate(), r.endDate(), r.rent(), r.deposit(), r.notes(), OffsetDateTime.now()).update();
        jdbc.sql("UPDATE flat SET occupancy='TENANT' WHERE id=? AND society_id=?").params(r.flatId(), u.societyId()).update();
        audit.record(u, "CREATE", "AGREEMENT", id, r.tenantName());
        return one(u, id);
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN','MANAGER')")
    public Agreement update(@PathVariable UUID id, @Valid @RequestBody Request r) {
        var u = CurrentUser.get();
        check(u, r);
        int n = jdbc.sql("UPDATE agreement SET flat_id=?, tenant_name=?, tenant_phone=?, start_date=?, end_date=?, rent=?, deposit=?, notes=? WHERE id=? AND society_id=?")
            .params(r.flatId(), r.tenantName().trim(), r.tenantPhone(), r.startDate(), r.endDate(), r.rent(), r.deposit(), r.notes(), id, u.societyId()).update();
        if (n == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Agreement not found");
        audit.record(u, "UPDATE", "AGREEMENT", id, r.tenantName());
        return one(u, id);
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public void delete(@PathVariable UUID id) {
        var u = CurrentUser.get();
        if (jdbc.sql("DELETE FROM agreement WHERE id=? AND society_id=?").params(id, u.societyId()).update() == 0)
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Agreement not found");
        audit.record(u, "DELETE", "AGREEMENT", id, null);
    }

    private Agreement one(CurrentUser u, UUID id) {
        return jdbc.sql(SELECT + " AND a.id=?").params(u.societyId(), id).query((rs, i) -> map(rs)).single();
    }

    private void check(CurrentUser u, Request r) {
        if (r.endDate().isBefore(r.startDate())) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "End date must be after the start date");
        if (jdbc.sql("SELECT count(*) FROM flat WHERE id=? AND society_id=?").params(r.flatId(), u.societyId()).query(Integer.class).single() == 0)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown flat");
    }
}
