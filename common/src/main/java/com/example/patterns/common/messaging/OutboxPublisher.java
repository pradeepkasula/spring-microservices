package com.example.patterns.common.messaging;

import java.nio.charset.StandardCharsets;
import java.util.concurrent.TimeUnit;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.kafka.clients.producer.ProducerRecord;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * PATTERN: Polling publisher - relays unsent outbox rows to Kafka. Delivery is at-least-once, so consumers must be
 * idempotent (see {@link IdempotentConsumer}). The alternative is Transaction log tailing (e.g. Debezium).
 */
@Component
@Slf4j
@RequiredArgsConstructor
@ConditionalOnProperty(name = "patterns.outbox.enabled", havingValue = "true", matchIfMissing = true)
public class OutboxPublisher {

    private final OutboxEventRepository repository;
    private final KafkaTemplate<String, String> kafka;

    @Scheduled(fixedDelayString = "${patterns.outbox.poll-interval-ms:500}")
    @Transactional
    public void relay() {
        for (OutboxEvent e : repository.findTop100BySentFalseOrderByCreatedAtAsc()) {
            ProducerRecord<String, String> record = new ProducerRecord<>(e.getTopic(), e.getMessageKey(), e.getPayload());
            record.headers().add(Msg.MESSAGE_ID, e.getId().getBytes(StandardCharsets.UTF_8));
            record.headers().add(Msg.TYPE, e.getEventType().getBytes(StandardCharsets.UTF_8));
            if (e.getCorrelationId() != null) {
                record.headers().add(Msg.CORRELATION_ID, e.getCorrelationId().getBytes(StandardCharsets.UTF_8));
            }
            try {
                kafka.send(record).get(5, TimeUnit.SECONDS); // blocking keeps ordering per key
                e.setSent(true);
            } catch (Exception ex) {
                if (ex instanceof InterruptedException) Thread.currentThread().interrupt();
                log.warn("Outbox relay failed for {} ({}), will retry: {}", e.getId(), e.getEventType(), ex.toString());
                return;
            }
        }
    }
}
