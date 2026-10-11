package com.societyos.document;

import java.io.IOException;
import java.io.InputStream;
import org.springframework.core.io.Resource;

/** Where uploaded files live. MVP uses local disk; swap the implementation for S3 / R2 later without touching callers. */
public interface FileStorage {
    void save(String key, InputStream in) throws IOException;
    Resource load(String key) throws IOException;
}
