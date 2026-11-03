package com.example.patterns.common.events;

import java.math.BigDecimal;

/** Message contracts shared between producers and consumers. The message type travels in the "eventType" header. */
public final class Contracts {
    private Contracts() {}

    // message types
    public static final String RESERVE_STOCK = "ReserveStock";
    public static final String RELEASE_STOCK = "ReleaseStock";
    public static final String PROCESS_PAYMENT = "ProcessPayment";
    public static final String SAGA_REPLY = "SagaReply";
    public static final String ORDER_CREATED = "OrderCreated";
    public static final String ORDER_APPROVED = "OrderApproved";
    public static final String ORDER_REJECTED = "OrderRejected";

    // saga step names
    public static final String STEP_RESERVE_STOCK = "RESERVE_STOCK";
    public static final String STEP_PROCESS_PAYMENT = "PROCESS_PAYMENT";
    public static final String STEP_RELEASE_STOCK = "RELEASE_STOCK";

    public record ReserveStock(String orderId, String sku, int quantity) {}
    public record ReleaseStock(String orderId) {}
    public record ProcessPayment(String orderId, String customerId, BigDecimal amount) {}
    public record SagaReply(String orderId, String step, boolean success, String reason) {}

    /** Domain event describing the state of an Order aggregate. */
    public record OrderEvent(String orderId, String customerId, String sku, int quantity,
                             BigDecimal amount, String status, String reason) {}
}
