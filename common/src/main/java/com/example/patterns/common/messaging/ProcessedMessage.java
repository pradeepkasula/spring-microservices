package com.example.patterns.common.messaging;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "processed_message")
@Getter @NoArgsConstructor @AllArgsConstructor
public class ProcessedMessage {
    @Id private String id;
    private Instant processedAt;
}
