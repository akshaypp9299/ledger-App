package com.societyos;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.junit.jupiter.api.Assertions.assertEquals;

import com.jayway.jsonpath.JsonPath;
import java.time.OffsetDateTime;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = {"societyos.seed.password=Test-Pass-123", "societyos.jwt.secret=test-secret-test-secret-test-secret-123"})
class ApiApplicationTests {

    @Autowired MockMvc mvc;
    @Autowired JdbcClient jdbc;
    @Autowired PasswordEncoder encoder;

    private String login(String email, String password) throws Exception {
        String body = "{\"email\":\"" + email + "\",\"password\":\"" + password + "\"}";
        var res = mvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isOk()).andReturn();
        return JsonPath.read(res.getResponse().getContentAsString(), "$.token");
    }

    @Test
    void loginRejectsWrongPasswordAndUnknownUser() throws Exception {
        for (String email : new String[] {"admin@shivranjan.local", "nobody@x.com"}) {
            mvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"" + email + "\",\"password\":\"wrong\"}")).andExpect(status().isUnauthorized());
        }
    }

    @Test
    void apiRequiresToken() throws Exception {
        mvc.perform(get("/api/v1/flats")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/flats").header("Authorization", "Bearer garbage")).andExpect(status().isUnauthorized());
    }

    @Test
    void viewerCanReadButNotWrite() throws Exception {
        String t = login("viewer@shivranjan.local", "Test-Pass-123");
        var res = mvc.perform(get("/api/v1/buildings").header("Authorization", "Bearer " + t)).andExpect(status().isOk()).andReturn();
        String buildingId = JsonPath.read(res.getResponse().getContentAsString(), "$[0].id");
        mvc.perform(post("/api/v1/flats").header("Authorization", "Bearer " + t).contentType(MediaType.APPLICATION_JSON)
            .content("{\"buildingId\":\"" + buildingId + "\",\"flatNumber\":\"999\",\"ownerName\":\"X\"}")).andExpect(status().isForbidden());
    }

    @Test
    void managerCanCreateFlatAndValidationWorks() throws Exception {
        String t = login("manager@shivranjan.local", "Test-Pass-123");
        var res = mvc.perform(get("/api/v1/buildings").header("Authorization", "Bearer " + t)).andReturn();
        String buildingId = JsonPath.read(res.getResponse().getContentAsString(), "$[0].id");
        mvc.perform(post("/api/v1/flats").header("Authorization", "Bearer " + t).contentType(MediaType.APPLICATION_JSON)
            .content("{\"buildingId\":\"" + buildingId + "\",\"flatNumber\":\"1201\",\"ownerName\":\"Test Owner\"}"))
            .andExpect(status().isCreated()).andExpect(jsonPath("$.flatNumber").value("1201")).andExpect(jsonPath("$.occupancy").value("OWNER"));
        mvc.perform(post("/api/v1/flats").header("Authorization", "Bearer " + t).contentType(MediaType.APPLICATION_JSON)
            .content("{\"buildingId\":\"" + buildingId + "\",\"flatNumber\":\"1201\",\"ownerName\":\"Dup\"}")).andExpect(status().isConflict());
        mvc.perform(post("/api/v1/flats").header("Authorization", "Bearer " + t).contentType(MediaType.APPLICATION_JSON)
            .content("{\"buildingId\":\"" + buildingId + "\",\"flatNumber\":\"\",\"ownerName\":\"\"}")).andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.fields.flatNumber").exists());
        int audits = jdbc.sql("SELECT count(*) FROM audit_event WHERE entity_type='FLAT' AND action='CREATE'").query(Integer.class).single();
        assertEquals(1, audits);
    }

    @Test
    void societyBCannotSeeOrTouchSocietyAData() throws Exception {
        UUID soc = UUID.randomUUID();
        UUID bld = UUID.randomUUID();
        var now = OffsetDateTime.now();
        jdbc.sql("INSERT INTO society (id,name,created_at) VALUES (?,?,?)").params(soc, "Other Society", now).update();
        jdbc.sql("INSERT INTO building (id,society_id,name) VALUES (?,?,?)").params(bld, soc, "Z").update();
        jdbc.sql("INSERT INTO app_user (id,society_id,email,full_name,password_hash,role,active,created_at) VALUES (?,?,?,?,?,?,TRUE,?)")
            .params(UUID.randomUUID(), soc, "mgr@other.local", "Other Mgr", encoder.encode("Other-Pass-1"), "MANAGER", now).update();
        UUID otherFlat = UUID.randomUUID();
        jdbc.sql("INSERT INTO flat (id,society_id,building_id,flat_number,occupancy,owner_name,created_at) VALUES (?,?,?,?,?,?,?)")
            .params(otherFlat, soc, bld, "Z-1", "OWNER", "Other Owner", now).update();

        String a = login("manager@shivranjan.local", "Test-Pass-123");
        String b = login("mgr@other.local", "Other-Pass-1");
        // B sees only its own single flat; A never sees it.
        mvc.perform(get("/api/v1/flats").header("Authorization", "Bearer " + b)).andExpect(jsonPath("$.length()").value(1));
        mvc.perform(get("/api/v1/flats/" + otherFlat).header("Authorization", "Bearer " + a)).andExpect(status().isNotFound());
        // A cannot create a flat in B's building.
        mvc.perform(post("/api/v1/flats").header("Authorization", "Bearer " + a).contentType(MediaType.APPLICATION_JSON)
            .content("{\"buildingId\":\"" + bld + "\",\"flatNumber\":\"77\",\"ownerName\":\"X\"}")).andExpect(status().isBadRequest());
    }
}
