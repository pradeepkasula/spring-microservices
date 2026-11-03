package com.example.patterns.common.messaging;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** PATTERN: Transactional outbox - the message row is written in the same local transaction as the business data. */
@Entity
@Table(name = "outbox_event")
@Getter @Setter @NoArgsConstructor
public class OutboxEvent {
    @Id private String id;
    private String topic;
    @Column(name = "msg_key") private String messageKey;
    @Column(name = "event_type") private String eventType;
    @Column(length = 4000) private String payload;
    private String correlationId;
    private Instant createdAt;
    private boolean sent;
}
