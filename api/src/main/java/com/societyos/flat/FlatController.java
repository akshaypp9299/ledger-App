package com.societyos.flat;

import com.societyos.common.AuditService;
import com.societyos.security.CurrentUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.RowMapper;
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
@RequestMapping("/api/v1")
public class FlatController {

    public record Building(UUID id, String name) {}
    public record Flat(UUID id, UUID buildingId, String building, String flatNumber, Integer floorNo, BigDecimal areaSqft,
                       String occupancy, String ownerName, String ownerPhone, String ownerEmail) {}
    public record FlatRequest(
        @NotNull UUID buildingId,
        @NotBlank @Size(max = 20) String flatNumber,
        Integer floorNo,
        BigDecimal areaSqft,
        @Pattern(regexp = "OWNER|TENANT|VACANT", message = "must be OWNER, TENANT or VACANT") String occupancy,
        @NotBlank @Size(max = 200) String ownerName,
        @Size(max = 30) String ownerPhone,
        @Size(max = 200) String ownerEmail) {}

    private static final String SELECT = """
        SELECT f.id, f.building_id, b.name AS building, f.flat_number, f.floor_no, f.area_sqft, f.occupancy, f.owner_name, f.owner_phone, f.owner_email
        FROM flat f JOIN building b ON b.id = f.building_id AND b.society_id = f.society_id""";
    private static final RowMapper<Flat> MAP = (rs, i) -> new Flat(
        rs.getObject("id", UUID.class), rs.getObject("building_id", UUID.class), rs.getString("building"), rs.getString("flat_number"),
        (Integer) rs.getObject("floor_no"), rs.getBigDecimal("area_sqft"), rs.getString("occupancy"),
        rs.getString("owner_name"), rs.getString("owner_phone"), rs.getString("owner_email"));

    private final JdbcClient jdbc;
    private final AuditService audit;

    public FlatController(JdbcClient jdbc, AuditService audit) { this.jdbc = jdbc; this.audit = audit; }

    @GetMapping("/buildings")
    public List<Building> buildings() {
        return jdbc.sql("SELECT id, name FROM building WHERE society_id = ? ORDER BY name")
            .param(CurrentUser.get().societyId())
            .query((rs, i) -> new Building(rs.getObject("id", UUID.class), rs.getString("name"))).list();
    }

    @GetMapping("/flats")
    public List<Flat> list() {
        return jdbc.sql(SELECT + " WHERE f.society_id = ? ORDER BY b.name, f.flat_number")
            .param(CurrentUser.get().societyId()).query(MAP).list();
    }

    @GetMapping("/flats/{id}")
    public Flat get(@PathVariable UUID id) {
        return jdbc.sql(SELECT + " WHERE f.society_id = ? AND f.id = ?").params(CurrentUser.get().societyId(), id).query(MAP).optional()
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Flat not found"));
    }

    @PostMapping("/flats")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAnyRole('ADMIN','MANAGER')")
    public Flat create(@Valid @RequestBody FlatRequest r) {
        var u = CurrentUser.get();
        requireBuilding(u, r.buildingId());
        UUID id = UUID.randomUUID();
        jdbc.sql("""
                INSERT INTO flat (id, society_id, building_id, flat_number, floor_no, area_sqft, occupancy, owner_name, owner_phone, owner_email, created_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?)""")
            .params(id, u.societyId(), r.buildingId(), r.flatNumber().trim(), r.floorNo(), r.areaSqft(),
                r.occupancy() == null ? "OWNER" : r.occupancy(), r.ownerName().trim(), r.ownerPhone(), r.ownerEmail(), OffsetDateTime.now())
            .update();
        audit.record(u, "CREATE", "FLAT", id, r.flatNumber());
        return get(id);
    }

    @PutMapping("/flats/{id}")
    @PreAuthorize("hasAnyRole('ADMIN','MANAGER')")
    public Flat update(@PathVariable UUID id, @Valid @RequestBody FlatRequest r) {
        var u = CurrentUser.get();
        requireBuilding(u, r.buildingId());
        int n = jdbc.sql("""
                UPDATE flat SET building_id=?, flat_number=?, floor_no=?, area_sqft=?, occupancy=?, owner_name=?, owner_phone=?, owner_email=?
                WHERE id=? AND society_id=?""")
            .params(r.buildingId(), r.flatNumber().trim(), r.floorNo(), r.areaSqft(), r.occupancy() == null ? "OWNER" : r.occupancy(),
                r.ownerName().trim(), r.ownerPhone(), r.ownerEmail(), id, u.societyId())
            .update();
        if (n == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Flat not found");
        audit.record(u, "UPDATE", "FLAT", id, r.flatNumber());
        return get(id);
    }

    private void requireBuilding(CurrentUser u, UUID buildingId) {
        int n = jdbc.sql("SELECT count(*) FROM building WHERE id = ? AND society_id = ?").params(buildingId, u.societyId()).query(Integer.class).single();
        if (n == 0) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown building");
    }
}
