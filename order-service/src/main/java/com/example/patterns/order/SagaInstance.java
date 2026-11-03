package com.example.patterns.order;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** Persistent state of one saga execution; survives restarts so the orchestrator can resume. */
@Entity
@Table(name = "saga_instance")
@Getter @Setter @NoArgsConstructor
public class SagaInstance {
    @Id private String orderId;
    @Enumerated(EnumType.STRING) private SagaState state;
    private String failureReason;
    private Instant updatedAt;
}
