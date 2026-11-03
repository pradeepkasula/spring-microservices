package com.example.patterns.common.web;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/** PATTERN: Audit logging - business-significant actions go to a dedicated logger so they can be routed separately. */
public final class AuditLog {
    private static final Logger LOG = LoggerFactory.getLogger("AUDIT");

    private AuditLog() {}

    public static void record(String action, String details) {
        LOG.info("action={} {}", action, details);
    }
}
