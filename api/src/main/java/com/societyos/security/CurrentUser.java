package com.societyos.security;

import java.util.UUID;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;

/** Identity of the caller. The society (tenant) always comes from the signed token, never from request input. */
public record CurrentUser(UUID userId, UUID societyId, String role) {

    public static CurrentUser get() {
        var auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !(auth.getPrincipal() instanceof Jwt jwt)) {
            throw new IllegalStateException("No authenticated user");
        }
        return new CurrentUser(UUID.fromString(jwt.getSubject()), UUID.fromString(jwt.getClaimAsString("society")), jwt.getClaimAsString("role"));
    }
}
