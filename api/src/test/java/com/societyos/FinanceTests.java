package com.societyos;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = {"societyos.seed.password=Test-Pass-123", "societyos.jwt.secret=test-secret-test-secret-test-secret-123"})
class FinanceTests {

    @Autowired MockMvc mvc;

    private String login(String email) throws Exception {
        var res = mvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
            .content("{\"email\":\"" + email + "\",\"password\":\"Test-Pass-123\"}")).andExpect(status().isOk()).andReturn();
        return "Bearer " + JsonPath.read(res.getResponse().getContentAsString(), "$.token");
    }

    private String json(String auth, String url) throws Exception {
        return mvc.perform(get(url).header("Authorization", auth)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
    }

    private void postJson(String auth, String url, String body, int expected) throws Exception {
        mvc.perform(post(url).header("Authorization", auth).contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().is(expected));
    }

    @SuppressWarnings("unchecked")
    @Test
    void chargesReceiptsPartialPaymentOverpaymentAndReversal() throws Exception {
        String m = login("manager@shivranjan.local");
        postJson(m, "/api/v1/charges/generate", "{\"period\":\"2031-01\",\"maintenance\":3000,\"sinking\":500,\"repair\":250}", 200);
        // idempotent: generating again creates nothing
        mvc.perform(post("/api/v1/charges/generate").header("Authorization", m).contentType(MediaType.APPLICATION_JSON)
            .content("{\"period\":\"2031-01\",\"maintenance\":3000}")).andExpect(jsonPath("$.created").value(0));

        String dues = json(m, "/api/v1/maintenance?period=2031-01");
        String flatId = JsonPath.read(dues, "$[0].flatId");
        assertEquals("UNPAID", JsonPath.read(dues, "$[0].funds.MAINTENANCE.status"));

        // partial payment
        postJson(m, "/api/v1/receipts", "{\"flatId\":\"" + flatId + "\",\"fund\":\"MAINTENANCE\",\"period\":\"2031-01\",\"amount\":1000,\"paidOn\":\"2031-01-05\",\"mode\":\"CASH\"}", 201);
        assertEquals("PARTIAL", JsonPath.read(json(m, "/api/v1/maintenance?period=2031-01"), "$[0].funds.MAINTENANCE.status"));
        // overpayment is rejected (2000 left, paying 2500)
        postJson(m, "/api/v1/receipts", "{\"flatId\":\"" + flatId + "\",\"fund\":\"MAINTENANCE\",\"period\":\"2031-01\",\"amount\":2500,\"paidOn\":\"2031-01-06\",\"mode\":\"CASH\"}", 400);
        // pay the rest
        postJson(m, "/api/v1/receipts", "{\"flatId\":\"" + flatId + "\",\"fund\":\"MAINTENANCE\",\"period\":\"2031-01\",\"amount\":2000,\"paidOn\":\"2031-01-07\",\"mode\":\"UPI\"}", 201);
        assertEquals("PAID", JsonPath.read(json(m, "/api/v1/maintenance?period=2031-01"), "$[0].funds.MAINTENANCE.status"));
        // no charge for another month
        postJson(m, "/api/v1/receipts", "{\"flatId\":\"" + flatId + "\",\"fund\":\"MAINTENANCE\",\"period\":\"2031-02\",\"amount\":10,\"paidOn\":\"2031-02-01\",\"mode\":\"CASH\"}", 400);

        // receipts landed in the cashbook as credits: opening 0 + 3000
        String ledger = json(m, "/api/v1/ledger?month=2031-01");
        assertEquals(3000.0, ((Number) JsonPath.read(ledger, "$.credits")).doubleValue());
        assertEquals(3000.0, ((Number) JsonPath.read(ledger, "$.closingBalance")).doubleValue());

        // reverse the 1000 receipt: due returns, balance drops by 1000, original history is kept
        String stmt = json(m, "/api/v1/flats/" + flatId + "/statement");
        String receiptId = ((java.util.List<String>) JsonPath.read(stmt, "$.receipts[?(@.amount==1000)].id")).get(0);
        postJson(m, "/api/v1/receipts/" + receiptId + "/reverse", "{}", 200);
        postJson(m, "/api/v1/receipts/" + receiptId + "/reverse", "{}", 404); // cannot reverse twice
        assertEquals("PARTIAL", JsonPath.read(json(m, "/api/v1/maintenance?period=2031-01"), "$[0].funds.MAINTENANCE.status"));
        ledger = json(m, "/api/v1/ledger?month=2031-01");
        assertEquals(2000.0, ((Number) JsonPath.read(ledger, "$.closingBalance")).doubleValue());
    }

    @Test
    void cashbookDebitsReversalsAndRoles() throws Exception {
        String m = login("manager@shivranjan.local");
        String v = login("viewer@shivranjan.local");
        String body = "{\"entryDate\":\"2032-03-10\",\"type\":\"DEBIT\",\"category\":\"Stationery & office\",\"amount\":500,\"mode\":\"CASH\"}";
        postJson(v, "/api/v1/ledger", body, 403);
        postJson(m, "/api/v1/ledger", "{\"entryDate\":\"2032-03-10\",\"type\":\"DEBIT\",\"category\":\"X\",\"amount\":-5}", 400);
        postJson(m, "/api/v1/ledger", body, 201);
        String ledger = json(m, "/api/v1/ledger?month=2032-03");
        double opening = ((Number) JsonPath.read(ledger, "$.openingBalance")).doubleValue();
        assertEquals(opening - 500.0, ((Number) JsonPath.read(ledger, "$.closingBalance")).doubleValue());
        String id = JsonPath.read(ledger, "$.entries[0].id");
        postJson(m, "/api/v1/ledger/" + id + "/reverse", "{\"reason\":\"typo\"}", 200);
        postJson(m, "/api/v1/ledger/" + id + "/reverse", "{}", 409);
        ledger = json(m, "/api/v1/ledger?month=2032-03");
        assertEquals(opening, ((Number) JsonPath.read(ledger, "$.closingBalance")).doubleValue());
        assertEquals(2, ((java.util.List<?>) JsonPath.read(ledger, "$.entries")).size()); // original kept + reversal
    }

    @Test
    void vendorPaymentsReduceOutstanding() throws Exception {
        String m = login("manager@shivranjan.local");
        String vendors = json(m, "/api/v1/vendors");
        String vendorId = JsonPath.read(vendors, "$[0].id");
        postJson(m, "/api/v1/vendors/" + vendorId + "/invoices", "{\"invoiceDate\":\"2033-01-01\",\"amount\":10000}", 201);
        postJson(m, "/api/v1/vendors/" + vendorId + "/payments", "{\"paidOn\":\"2033-01-10\",\"amount\":4000,\"mode\":\"CHEQUE\",\"chequeNo\":\"000123\"}", 201);
        var detail = json(m, "/api/v1/vendors/" + vendorId);
        assertEquals(6000.0, ((Number) JsonPath.read(detail, "$.vendor.outstanding")).doubleValue());
    }

    @Test
    void exportAndDashboardWork() throws Exception {
        String m = login("manager@shivranjan.local");
        mvc.perform(get("/api/v1/export/flats.csv").header("Authorization", m)).andExpect(status().isOk());
        mvc.perform(get("/api/v1/export/nope.csv").header("Authorization", m)).andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/dashboard?period=2031-01").header("Authorization", m)).andExpect(status().isOk()).andExpect(jsonPath("$.buildings.length()").value(3));
        mvc.perform(get("/api/v1/export/flats.csv").header("Authorization", login("viewer@shivranjan.local"))).andExpect(status().isForbidden());
    }
}
