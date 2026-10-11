package com.societyos.finance;

import com.societyos.security.CurrentUser;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

/** The only place that writes cashbook rows. Posted entries are append-only; corrections are reversal entries. */
@Service
public class LedgerService {
    private final JdbcClient jdbc;

    public LedgerService(JdbcClient jdbc) { this.jdbc = jdbc; }

    public UUID post(CurrentUser u, LocalDate date, String type, String category, BigDecimal amount, String description,
                     String mode, String chequeNo, UUID vendorId, UUID receiptId, UUID reversalOf) {
        UUID id = UUID.randomUUID();
        jdbc.sql("""
                INSERT INTO ledger_entry (id, society_id, entry_date, entry_type, category, amount, description, mode, cheque_no, vendor_id, receipt_id, reversal_of_id, reversed, created_by, created_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,FALSE,?,?)""")
            .params(id, u.societyId(), date, type, category, amount, description, mode, chequeNo, vendorId, receiptId, reversalOf, u.userId(), OffsetDateTime.now())
            .update();
        return id;
    }

    /** Posts the opposite entry (same date as the original, so month reports net to zero) and flags the original. Receipt-linked entries can only be reversed through their receipt. */
    public UUID reverse(CurrentUser u, UUID entryId, String reason) {
        var e = jdbc.sql("SELECT entry_type, category, amount, mode, cheque_no, vendor_id, reversed, reversal_of_id, entry_date FROM ledger_entry WHERE id=? AND society_id=?")
            .params(entryId, u.societyId())
            .query((rs, i) -> new Object[] {rs.getString("entry_type"), rs.getString("category"), rs.getBigDecimal("amount"), rs.getString("mode"),
                rs.getString("cheque_no"), rs.getObject("vendor_id", UUID.class), rs.getBoolean("reversed"), rs.getObject("reversal_of_id", UUID.class), rs.getObject("entry_date", LocalDate.class)})
            .optional().orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Entry not found"));
        if ((boolean) e[6]) throw new ResponseStatusException(HttpStatus.CONFLICT, "Entry is already reversed");
        if (e[7] != null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A reversal entry cannot be reversed");
        jdbc.sql("UPDATE ledger_entry SET reversed=TRUE WHERE id=? AND society_id=?").params(entryId, u.societyId()).update();
        String opposite = "CREDIT".equals(e[0]) ? "DEBIT" : "CREDIT";
        return post(u, (LocalDate) e[8], opposite, "Reversal: " + e[1], (BigDecimal) e[2], reason, (String) e[3], (String) e[4], (UUID) e[5], null, entryId);
    }
}
