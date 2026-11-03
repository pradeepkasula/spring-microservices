package com.example.patterns.common.events;

public final class Topics {
    private Topics() {}

    /** Domain events published by the order aggregate (publish/subscribe). */
    public static final String ORDER_EVENTS = "order-events";
    /** Saga commands (asynchronous request/reply). */
    public static final String INVENTORY_COMMANDS = "inventory-commands";
    public static final String PAYMENT_COMMANDS = "payment-commands";
    /** Saga replies go back to the orchestrator. */
    public static final String SAGA_REPLIES = "order-saga-replies";
}
