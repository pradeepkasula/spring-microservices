package com.example.patterns.common.messaging;

import java.nio.charset.StandardCharsets;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.apache.kafka.common.header.Header;
import org.slf4j.MDC;

public final class Msg {
    private Msg() {}

    public static final String MESSAGE_ID = "messageId";
    public static final String TYPE = "eventType";
    public static final String CORRELATION_ID = "correlationId";

    public static String header(ConsumerRecord<?, ?> r, String name) {
        Header h = r.headers().lastHeader(name);
        return h == null ? null : new String(h.value(), StandardCharsets.UTF_8);
    }

    public static String id(ConsumerRecord<?, ?> r) {
        String id = header(r, MESSAGE_ID);
        return id != null ? id : r.topic() + "-" + r.partition() + "-" + r.offset();
    }

    public static String type(ConsumerRecord<?, ?> r) {
        return header(r, TYPE);
    }

    /** Restores the producer's correlation id so one business flow is traceable across services in the logs. */
    public static void withCorrelation(ConsumerRecord<?, ?> r, Runnable action) {
        String cid = header(r, CORRELATION_ID);
        if (cid != null) MDC.put("correlationId", cid);
        try {
            action.run();
        } finally {
            MDC.remove("correlationId");
        }
    }
}
