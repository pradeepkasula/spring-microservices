package com.example.patterns.query;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** Denormalised read model, maintained only from order events. */
@Entity
@Table(name = "order_summary")
@Getter @Setter @NoArgsConstructor
public class OrderSummary {
    @Id private String orderId;
    private String customerId;
    private String sku;
    private int quantity;
    private BigDecimal amount;
    private String status;
    private String reason;
    private Instant updatedAt;
}
