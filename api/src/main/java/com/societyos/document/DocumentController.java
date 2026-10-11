package com.societyos.document;

import com.societyos.common.AuditService;
import com.societyos.security.CurrentUser;
import java.io.IOException;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.core.io.Resource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1/documents")
public class DocumentController {

    private static final long MAX_BYTES = 10L * 1024 * 1024;
    // Allowlist by extension; we also pin the content type we serve back, never trusting the client's.
    private static final Map<String, String> TYPES = Map.of("pdf", "application/pdf", "png", "image/png", "jpg", "image/jpeg", "jpeg", "image/jpeg",
        "doc", "application/msword", "docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "xls", "application/vnd.ms-excel", "xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    private static final Set<String> CATEGORIES = Set.of("Agreement", "Receipt", "Bank statement", "Minutes", "NOC", "Invoice", "Share certificate", "Other");

    public record Doc(UUID id, String title, String category, UUID flatId, String flatLabel, String filename, long sizeBytes, OffsetDateTime createdAt) {}

    private final JdbcClient jdbc;
    private final AuditService audit;
    private final FileStorage storage;

    public DocumentController(JdbcClient jdbc, AuditService audit, FileStorage storage) { this.jdbc = jdbc; this.audit = audit; this.storage = storage; }

    @GetMapping
    public List<Doc> list() {
        return jdbc.sql("""
                SELECT d.id, d.title, d.category, d.flat_id, b.name AS building, f.flat_number, d.filename, d.size_bytes, d.created_at
                FROM document d LEFT JOIN flat f ON f.id=d.flat_id AND f.society_id=d.society_id LEFT JOIN building b ON b.id=f.building_id AND b.society_id=f.society_id
                WHERE d.society_id=? ORDER BY d.created_at DESC""")
            .param(CurrentUser.get().societyId())
            .query((rs, i) -> new Doc(rs.getObject("id", UUID.class), rs.getString("title"), rs.getString("category"), rs.getObject("flat_id", UUID.class),
                rs.getString("flat_number") == null ? null : rs.getString("building") + "-" + rs.getString("flat_number"), rs.getString("filename"),
                rs.getLong("size_bytes"), rs.getObject("created_at", OffsetDateTime.class))).list();
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAnyRole('ADMIN','MANAGER')")
    public Map<String, Object> upload(@RequestParam String title, @RequestParam String category, @RequestParam(required = false) UUID flatId,
                                      @RequestParam("file") MultipartFile file) throws IOException {
        var u = CurrentUser.get();
        if (title.isBlank() || title.length() > 200) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Title is required (max 200 characters)");
        if (!CATEGORIES.contains(category)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown category");
        if (file.isEmpty()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Choose a file");
        if (file.getSize() > MAX_BYTES) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "File is larger than 10 MB");
        String original = file.getOriginalFilename() == null ? "file" : file.getOriginalFilename().replaceAll("[^A-Za-z0-9._ -]", "_");
        String ext = original.contains(".") ? original.substring(original.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT) : "";
        if (!TYPES.containsKey(ext)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Allowed file types: PDF, PNG, JPG, DOC(X), XLS(X)");
        if (flatId != null && jdbc.sql("SELECT count(*) FROM flat WHERE id=? AND society_id=?").params(flatId, u.societyId()).query(Integer.class).single() == 0)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown flat");

        UUID id = UUID.randomUUID();
        String key = u.societyId() + "/" + id + "." + ext; // random key; the user's filename never touches the disk path
        try (var in = file.getInputStream()) { storage.save(key, in); }
        jdbc.sql("INSERT INTO document (id, society_id, title, category, flat_id, filename, content_type, size_bytes, storage_key, uploaded_by, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
            .params(id, u.societyId(), title.trim(), category, flatId, original, TYPES.get(ext), file.getSize(), key, u.userId(), OffsetDateTime.now()).update();
        audit.record(u, "UPLOAD", "DOCUMENT", id, title);
        return Map.of("id", id);
    }

    @GetMapping("/{id}/file")
    public ResponseEntity<Resource> download(@PathVariable UUID id) throws IOException {
        var u = CurrentUser.get();
        var row = jdbc.sql("SELECT filename, content_type, storage_key FROM document WHERE id=? AND society_id=?").params(id, u.societyId())
            .query((rs, i) -> new String[] {rs.getString("filename"), rs.getString("content_type"), rs.getString("storage_key")}).optional()
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Document not found"));
        Resource res = storage.load(row[2]);
        if (!res.exists()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "File is missing from storage");
        return ResponseEntity.ok().contentType(MediaType.parseMediaType(row[1]))
            .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename(row[0]).build().toString())
            .header("X-Content-Type-Options", "nosniff").body(res);
    }
}
