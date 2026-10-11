package com.societyos.seed;

import java.security.SecureRandom;
import java.time.OffsetDateTime;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

/** Creates the first society, buildings, sample flats and one user per role. Idempotent: does nothing if a society exists. */
@Component
public class SeedRunner implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(SeedRunner.class);
    private final JdbcClient jdbc;
    private final PasswordEncoder encoder;
    private final boolean enabled;
    private final String societyName;
    private final String configuredPassword;

    public SeedRunner(JdbcClient jdbc, PasswordEncoder encoder, @Value("${societyos.seed.enabled}") boolean enabled,
                      @Value("${societyos.seed.society-name}") String societyName, @Value("${societyos.seed.password:}") String pw) {
        this.jdbc = jdbc; this.encoder = encoder; this.enabled = enabled; this.societyName = societyName; this.configuredPassword = pw;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (!enabled || jdbc.sql("SELECT count(*) FROM society").query(Integer.class).single() > 0) return;

        var now = OffsetDateTime.now();
        UUID society = UUID.randomUUID();
        jdbc.sql("INSERT INTO society (id, name, created_at) VALUES (?,?,?)").params(society, societyName, now).update();

        String[] names = {"A", "B", "C"};
        UUID[] buildings = new UUID[3];
        for (int i = 0; i < 3; i++) {
            buildings[i] = UUID.randomUUID();
            jdbc.sql("INSERT INTO building (id, society_id, name) VALUES (?,?,?)").params(buildings[i], society, names[i]).update();
        }
        String[] owners = {"Rohan Kulkarni", "Meera Joshi", "Aarav Deshmukh", "Sneha Patil", "Vikram Shah", "Anita Rao", "Kiran More", "Pooja Nair"};
        for (int i = 0; i < 24; i++) {
            int floor = i / 3 + 1;
            String occ = i % 5 == 0 ? "TENANT" : i % 11 == 0 ? "VACANT" : "OWNER";
            jdbc.sql("""
                    INSERT INTO flat (id, society_id, building_id, flat_number, floor_no, occupancy, owner_name, created_at)
                    VALUES (?,?,?,?,?,?,?,?)""")
                .params(UUID.randomUUID(), society, buildings[i % 3], floor + "0" + (i % 4 + 1), floor, occ, owners[i % owners.length], now).update();
        }

        String[][] staff = {{"Ramesh Pawar", "SECURITY", "Morning"}, {"Sunil Jadhav", "SECURITY", "Evening"}, {"Kavita Shinde", "HOUSEKEEPING", "Morning"}, {"Lata More", "HOUSEKEEPING", "Morning"}};
        for (String[] st : staff)
            jdbc.sql("INSERT INTO staff (id, society_id, name, role, shift, active) VALUES (?,?,?,?,?,TRUE)").params(UUID.randomUUID(), society, st[0], st[1], st[2]).update();
        String[][] contacts = {{"Main Gate Security", "Security cabin", "9800000001"}, {"Society Manager", "Office", "9800000002"}, {"Plumber", "On call", "9800000003"}};
        for (String[] c : contacts)
            jdbc.sql("INSERT INTO emergency_contact (id, society_id, name, role, phone) VALUES (?,?,?,?,?)").params(UUID.randomUUID(), society, c[0], c[1], c[2]).update();
        String[][] vendors = {{"Sai Lift Services", "Lift"}, {"CleanPro Housekeeping", "Housekeeping"}, {"City Water Tankers", "Water"}};
        for (String[] v : vendors)
            jdbc.sql("INSERT INTO vendor (id, society_id, name, category, active, created_at) VALUES (?,?,?,?,TRUE,?)").params(UUID.randomUUID(), society, v[0], v[1], now).update();

        String pw = configuredPassword.isBlank() ? randomPassword() : configuredPassword;
        String hash = encoder.encode(pw);
        String[][] users = {{"admin@shivranjan.local", "Admin", "ADMIN"}, {"manager@shivranjan.local", "Manager", "MANAGER"},
                            {"viewer@shivranjan.local", "Viewer", "VIEWER"}};
        for (String[] u : users) {
            jdbc.sql("INSERT INTO app_user (id, society_id, email, full_name, password_hash, role, active, created_at) VALUES (?,?,?,?,?,?,TRUE,?)")
                .params(UUID.randomUUID(), society, u[0], u[1], hash, u[2], now).update();
        }
        log.warn("SEEDED '{}' with 3 users (admin/manager/viewer @shivranjan.local). Shared dev password: {}  <- change before any real use", societyName, pw);
    }

    private static String randomPassword() {
        String chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
        var r = new SecureRandom();
        var sb = new StringBuilder();
        for (int i = 0; i < 14; i++) sb.append(chars.charAt(r.nextInt(chars.length())));
        return sb.toString();
    }
}
