package com.societyos.notice;

import com.societyos.common.AuditService;
import com.societyos.security.CurrentUser;
import jakarta.validation.Valid;
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
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1")
public class NoticeController {

    public record NoticeRequest(@NotBlank @Size(max = 200) String title, @NotBlank @Size(max = 4000) String body,
                                @Pattern(regexp = "LOW|NORMAL|HIGH", message = "invalid priority") String priority) {}
    public record Notice(UUID id, String title, String body, String priority, OffsetDateTime createdAt) {}
    public record ContactRequest(@NotBlank @Size(max = 200) String name, @Size(max = 100) String role, @NotBlank @Size(max = 30) String phone, @Size(max = 200) String note) {}
    public record Contact(UUID id, String name, String role, String phone, String note) {}

    private final JdbcClient jdbc;
    private final AuditService audit;

    public NoticeController(JdbcClient jdbc, AuditService audit) { this.jdbc = jdbc; this.audit = audit; }

    @GetMapping("/notices")
    public List<Notice> notices() {
        return jdbc.sql("SELECT id, title, body, priority, created_at FROM notice WHERE society_id=? ORDER BY created_at DESC").param(CurrentUser.get().societyId())
            .query((rs, i) -> new Notice(rs.getObject("id", UUID.class), rs.getString("title"), rs.getString("body"), rs.getString("priority"),
                rs.getObject("created_at", OffsetDateTime.class))).list();
    }

    @PostMapping("/notices")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAnyRole('ADMIN','MANAGER')")
    public Map<String, Object> create(@Valid @RequestBody NoticeRequest r) {
        var u = CurrentUser.get();
        UUID id = UUID.randomUUID();
        jdbc.sql("INSERT INTO notice (id, society_id, title, body, priority, created_by, created_at) VALUES (?,?,?,?,?,?,?)")
            .params(id, u.societyId(), r.title().trim(), r.body().trim(), r.priority() == null ? "NORMAL" : r.priority(), u.userId(), OffsetDateTime.now()).update();
        audit.record(u, "CREATE", "NOTICE", id, r.title());
        return Map.of("id", id);
    }

    @DeleteMapping("/notices/{id}")
    @PreAuthorize("hasAnyRole('ADMIN','MANAGER')")
    public void delete(@PathVariable UUID id) {
        var u = CurrentUser.get();
        if (jdbc.sql("DELETE FROM notice WHERE id=? AND society_id=?").params(id, u.societyId()).update() == 0)
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Notice not found");
        audit.record(u, "DELETE", "NOTICE", id, null);
    }

    @GetMapping("/emergency-contacts")
    public List<Contact> contacts() {
        return jdbc.sql("SELECT id, name, role, phone, note FROM emergency_contact WHERE society_id=? ORDER BY name").param(CurrentUser.get().societyId())
            .query((rs, i) -> new Contact(rs.getObject("id", UUID.class), rs.getString("name"), rs.getString("role"), rs.getString("phone"), rs.getString("note"))).list();
    }

    @PostMapping("/emergency-contacts")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAnyRole('ADMIN','MANAGER')")
    public Map<String, Object> addContact(@Valid @RequestBody ContactRequest r) {
        var u = CurrentUser.get();
        UUID id = UUID.randomUUID();
        jdbc.sql("INSERT INTO emergency_contact (id, society_id, name, role, phone, note) VALUES (?,?,?,?,?,?)")
            .params(id, u.societyId(), r.name().trim(), r.role(), r.phone().trim(), r.note()).update();
        audit.record(u, "CREATE", "CONTACT", id, r.name());
        return Map.of("id", id);
    }

    @DeleteMapping("/emergency-contacts/{id}")
    @PreAuthorize("hasAnyRole('ADMIN','MANAGER')")
    public void deleteContact(@PathVariable UUID id) {
        var u = CurrentUser.get();
        if (jdbc.sql("DELETE FROM emergency_contact WHERE id=? AND society_id=?").params(id, u.societyId()).update() == 0)
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Contact not found");
        audit.record(u, "DELETE", "CONTACT", id, null);
    }
}
