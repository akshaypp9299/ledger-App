package com.societyos.auth;

import com.societyos.security.CurrentUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1")
public class AuthController {

    public record LoginRequest(@NotBlank String email, @NotBlank String password) {}
    public record UserInfo(UUID id, String name, String email, String role, UUID societyId, String societyName) {}
    private record Row(UserInfo info, String hash) {}

    private final JdbcClient jdbc;
    private final PasswordEncoder encoder;
    private final JwtEncoder jwt;
    private final long ttlMinutes;
    // Compared against when the email is unknown, so unknown emails take as long as wrong passwords.
    private final String dummyHash;

    public AuthController(JdbcClient jdbc, PasswordEncoder encoder, JwtEncoder jwt, @Value("${societyos.jwt.ttl-minutes}") long ttlMinutes) {
        this.jdbc = jdbc; this.encoder = encoder; this.jwt = jwt; this.ttlMinutes = ttlMinutes;
        this.dummyHash = encoder.encode("not-a-real-password");
    }

    @GetMapping("/health")
    public Map<String, String> health() { return Map.of("status", "ok"); }

    @PostMapping("/auth/login")
    public Map<String, Object> login(@Valid @RequestBody LoginRequest req) {
        Optional<Row> row = jdbc.sql("""
                SELECT u.id, u.full_name, u.email, u.role, u.password_hash, u.society_id, s.name AS society_name
                FROM app_user u JOIN society s ON s.id = u.society_id
                WHERE lower(u.email) = lower(?) AND u.active = TRUE""")
            .param(req.email().trim())
            .query((rs, i) -> new Row(new UserInfo(rs.getObject("id", UUID.class), rs.getString("full_name"), rs.getString("email"),
                rs.getString("role"), rs.getObject("society_id", UUID.class), rs.getString("society_name")), rs.getString("password_hash")))
            .optional();

        boolean ok = encoder.matches(req.password(), row.map(Row::hash).orElse(dummyHash));
        if (row.isEmpty() || !ok) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Incorrect email or password");

        UserInfo u = row.get().info();
        var now = Instant.now();
        var claims = JwtClaimsSet.builder().subject(u.id().toString()).issuedAt(now).expiresAt(now.plus(ttlMinutes, ChronoUnit.MINUTES))
            .claim("society", u.societyId().toString()).claim("role", u.role()).build();
        String token = jwt.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims)).getTokenValue();
        return Map.of("token", token, "user", u);
    }

    @GetMapping("/me")
    public UserInfo me() {
        var c = CurrentUser.get();
        return jdbc.sql("""
                SELECT u.id, u.full_name, u.email, u.role, u.society_id, s.name AS society_name
                FROM app_user u JOIN society s ON s.id = u.society_id WHERE u.id = ? AND u.society_id = ? AND u.active = TRUE""")
            .params(c.userId(), c.societyId())
            .query((rs, i) -> new UserInfo(rs.getObject("id", UUID.class), rs.getString("full_name"), rs.getString("email"), rs.getString("role"),
                rs.getObject("society_id", UUID.class), rs.getString("society_name")))
            .optional().orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Session expired"));
    }
}
