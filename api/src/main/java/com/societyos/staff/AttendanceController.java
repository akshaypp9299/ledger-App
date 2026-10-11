package com.societyos.staff;

import com.societyos.common.AuditService;
import com.societyos.finance.MaintenanceController;
import com.societyos.security.CurrentUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
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
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1")
public class AttendanceController {

    public record StaffRequest(@NotBlank @Size(max = 200) String name, @Pattern(regexp = "SECURITY|HOUSEKEEPING|OTHER", message = "invalid role") String role,
                               @Size(max = 30) String shift, @Size(max = 30) String phone) {}
    public record MarkRequest(@NotNull UUID staffId, @NotNull LocalDate date, @Pattern(regexp = "PRESENT|ABSENT|LEAVE|CLEAR", message = "invalid status") String status) {}
    public record Staff(UUID id, String name, String role, String shift, String phone) {}
    public record Mark(UUID staffId, LocalDate date, String status) {}

    private final JdbcClient jdbc;
    private final AuditService audit;

    public AttendanceController(JdbcClient jdbc, AuditService audit) { this.jdbc = jdbc; this.audit = audit; }

    @GetMapping("/staff")
    public List<Staff> staff() {
        return jdbc.sql("SELECT id, name, role, shift, phone FROM staff WHERE society_id=? AND active=TRUE ORDER BY role, name").param(CurrentUser.get().societyId())
            .query((rs, i) -> new Staff(rs.getObject("id", UUID.class), rs.getString("name"), rs.getString("role"), rs.getString("shift"), rs.getString("phone"))).list();
    }

    @PostMapping("/staff")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAnyRole('ADMIN','MANAGER')")
    public Map<String, Object> addStaff(@Valid @RequestBody StaffRequest r) {
        var u = CurrentUser.get();
        UUID id = UUID.randomUUID();
        jdbc.sql("INSERT INTO staff (id, society_id, name, role, shift, phone, active) VALUES (?,?,?,?,?,?,TRUE)")
            .params(id, u.societyId(), r.name().trim(), r.role(), r.shift(), r.phone()).update();
        audit.record(u, "CREATE", "STAFF", id, r.name());
        return Map.of("id", id);
    }

    @GetMapping("/attendance")
    public List<Mark> month(@RequestParam @Pattern(regexp = MaintenanceController.PERIOD_RE) String month) {
        var u = CurrentUser.get();
        YearMonth ym = YearMonth.parse(month);
        return jdbc.sql("SELECT staff_id, work_date, status FROM attendance_record WHERE society_id=? AND work_date >= ? AND work_date < ?")
            .params(u.societyId(), ym.atDay(1), ym.plusMonths(1).atDay(1))
            .query((rs, i) -> new Mark(rs.getObject("staff_id", UUID.class), rs.getObject("work_date", LocalDate.class), rs.getString("status"))).list();
    }

    @PutMapping("/attendance")
    @PreAuthorize("hasAnyRole('ADMIN','MANAGER')")
    @Transactional
    public Map<String, Object> mark(@Valid @RequestBody MarkRequest r) {
        var u = CurrentUser.get();
        if (r.date().isAfter(LocalDate.now())) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Cannot mark attendance for a future date");
        if (jdbc.sql("SELECT count(*) FROM staff WHERE id=? AND society_id=?").params(r.staffId(), u.societyId()).query(Integer.class).single() == 0)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown staff member");
        jdbc.sql("DELETE FROM attendance_record WHERE society_id=? AND staff_id=? AND work_date=?").params(u.societyId(), r.staffId(), r.date()).update();
        if (!"CLEAR".equals(r.status())) {
            jdbc.sql("INSERT INTO attendance_record (id, society_id, staff_id, work_date, status) VALUES (?,?,?,?,?)")
                .params(UUID.randomUUID(), u.societyId(), r.staffId(), r.date(), r.status()).update();
        }
        audit.record(u, "MARK", "ATTENDANCE", r.staffId(), r.date() + " " + r.status());
        return Map.of("ok", true);
    }
}
