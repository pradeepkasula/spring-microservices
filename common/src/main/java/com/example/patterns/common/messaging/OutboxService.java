package com.example.patterns.common.messaging;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.slf4j.MDC;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class OutboxService {

    private final OutboxEventRepository repository;
    private final ObjectMapper mapper;

    /** MANDATORY: refuses to run outside a business transaction, which is the whole point of the outbox. */
    @Transactional(propagation = Propagation.MANDATORY)
    public void publish(String topic, String key, String type, Object payload) {
        OutboxEvent e = new OutboxEvent();
        e.setId(UUID.randomUUID().toString());
        e.setTopic(topic);
        e.setMessageKey(key);
        e.setEventType(type);
        e.setCorrelationId(MDC.get("correlationId"));
        e.setCreatedAt(Instant.now());
        try {
            e.setPayload(mapper.writeValueAsString(payload));
        } catch (JsonProcessingException ex) {
            throw new IllegalStateException("Cannot serialise " + type, ex);
        }
        repository.save(e);
    }
}
