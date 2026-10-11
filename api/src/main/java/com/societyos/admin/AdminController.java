package com.societyos.admin;

import com.societyos.common.AuditService;
import com.societyos.security.CurrentUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1")
public class AdminController {

    public record UserRequest(@NotBlank @Email @Size(max = 200) String email, @NotBlank @Size(max = 200) String fullName,
                              @Pattern(regexp = "ADMIN|MANAGER|VIEWER", message = "invalid role") String role,
                              @NotBlank @Size(min = 10, max = 100, message = "must be 10-100 characters") String password) {}
    public record ActiveRequest(boolean active) {}
    public record User(UUID id, String email, String fullName, String role, boolean active) {}
    public record Event(UUID id, String userName, String action, String entityType, String detail, OffsetDateTime createdAt) {}

    private final JdbcClient jdbc;
    private final AuditService audit;
    private final PasswordEncoder encoder;

    public AdminController(JdbcClient jdbc, AuditService audit, PasswordEncoder encoder) { this.jdbc = jdbc; this.audit = audit; this.encoder = encoder; }

    @GetMapping("/users")
    @PreAuthorize("hasRole('ADMIN')")
    public List<User> users() {
        return jdbc.sql("SELECT id, email, full_name, role, active FROM app_user WHERE society_id=? ORDER BY role, full_name").param(CurrentUser.get().societyId())
            .query((rs, i) -> new User(rs.getObject("id", UUID.class), rs.getString("email"), rs.getString("full_name"), rs.getString("role"), rs.getBoolean("active"))).list();
    }

    @PostMapping("/users")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasRole('ADMIN')")
    public Map<String, Object> create(@Valid @RequestBody UserRequest r) {
        var u = CurrentUser.get();
        UUID id = UUID.randomUUID();
        jdbc.sql("INSERT INTO app_user (id, society_id, email, full_name, password_hash, role, active, created_at) VALUES (?,?,?,?,?,?,TRUE,?)")
            .params(id, u.societyId(), r.email().trim().toLowerCase(), r.fullName().trim(), encoder.encode(r.password()), r.role(), OffsetDateTime.now()).update();
        audit.record(u, "CREATE", "USER", id, r.email() + " " + r.role());
        return Map.of("id", id);
    }

    @PatchMapping("/users/{id}/active")
    @PreAuthorize("hasRole('ADMIN')")
    public Map<String, Object> setActive(@PathVariable UUID id, @RequestBody ActiveRequest r) {
        var u = CurrentUser.get();
        if (id.equals(u.userId()) && !r.active()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "You cannot deactivate your own account");
        if (jdbc.sql("UPDATE app_user SET active=? WHERE id=? AND society_id=?").params(r.active(), id, u.societyId()).update() == 0)
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found");
        audit.record(u, r.active() ? "ACTIVATE" : "DEACTIVATE", "USER", id, null);
        return Map.of("active", r.active());
    }

    @GetMapping("/audit")
    @PreAuthorize("hasAnyRole('ADMIN','MANAGER')")
    public List<Event> audit(@RequestParam(defaultValue = "100") int limit) {
        return jdbc.sql("""
                SELECT e.id, COALESCE(u.full_name,'System') AS user_name, e.action, e.entity_type, e.detail, e.created_at
                FROM audit_event e LEFT JOIN app_user u ON u.id=e.user_id WHERE e.society_id=? ORDER BY e.created_at DESC LIMIT ?""")
            .params(CurrentUser.get().societyId(), Math.min(Math.max(limit, 1), 500))
            .query((rs, i) -> new Event(rs.getObject("id", UUID.class), rs.getString("user_name"), rs.getString("action"), rs.getString("entity_type"),
                rs.getString("detail"), rs.getObject("created_at", OffsetDateTime.class))).list();
    }
}
