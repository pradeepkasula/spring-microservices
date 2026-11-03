package com.example.patterns.order;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** PATTERN: Aggregate (DDD) - the consistency boundary changed by exactly one local transaction. */
@Entity
@Table(name = "orders")
@Getter @Setter @NoArgsConstructor
public class Order {
    @Id private String id;
    private String customerId;
    private String sku;
    private int quantity;
    private BigDecimal amount;
    @Enumerated(EnumType.STRING) private OrderStatus status;
    private String reason;
    private Instant createdAt;
}
