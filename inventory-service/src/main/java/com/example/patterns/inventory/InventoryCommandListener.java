package com.example.patterns.inventory;

import static com.example.patterns.common.events.Contracts.RELEASE_STOCK;
import static com.example.patterns.common.events.Contracts.RESERVE_STOCK;
import static com.example.patterns.common.events.Contracts.SAGA_REPLY;
import static com.example.patterns.common.events.Contracts.STEP_RELEASE_STOCK;
import static com.example.patterns.common.events.Contracts.STEP_RESERVE_STOCK;

import com.example.patterns.common.events.Contracts.ReleaseStock;
import com.example.patterns.common.events.Contracts.ReserveStock;
import com.example.patterns.common.events.Contracts.SagaReply;
import com.example.patterns.common.events.Topics;
import com.example.patterns.common.messaging.IdempotentConsumer;
import com.example.patterns.common.messaging.MessageReader;
import com.example.patterns.common.messaging.Msg;
import com.example.patterns.common.messaging.OutboxService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

/**
 * Saga participant: executes the local transaction for each command and replies through the outbox.
 * ReleaseStock is the compensating transaction for ReserveStock.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class InventoryCommandListener {

    private final StockItemRepository stock;
    private final ReservationRepository reservations;
    private final IdempotentConsumer idempotent;
    private final MessageReader reader;
    private final OutboxService outbox;

    @KafkaListener(topics = Topics.INVENTORY_COMMANDS, groupId = "inventory-service")
    public void onCommand(ConsumerRecord<String, String> record) {
        Msg.withCorrelation(record, () ->
                idempotent.runOnce("inventory-service", Msg.id(record), () -> handle(record)));
    }

    private void handle(ConsumerRecord<String, String> record) {
        switch (Msg.type(record)) {
            case RESERVE_STOCK -> reserve(reader.read(record, ReserveStock.class));
            case RELEASE_STOCK -> release(reader.read(record, ReleaseStock.class));
            default -> log.warn("Unknown command type {}", Msg.type(record));
        }
    }

    private void reserve(ReserveStock cmd) {
        StockItem item = stock.findById(cmd.sku()).orElse(null);
        if (item == null || item.getAvailable() < cmd.quantity()) {
            log.info("Cannot reserve {} x {} for order {}", cmd.quantity(), cmd.sku(), cmd.orderId());
            reply(cmd.orderId(), STEP_RESERVE_STOCK, false, "Insufficient stock for " + cmd.sku());
            return;
        }
        item.setAvailable(item.getAvailable() - cmd.quantity());
        item.setReserved(item.getReserved() + cmd.quantity());
        stock.save(item);
        reservations.save(new Reservation(cmd.orderId(), cmd.sku(), cmd.quantity(), false));
        reply(cmd.orderId(), STEP_RESERVE_STOCK, true, null);
    }

    private void release(ReleaseStock cmd) {
        reservations.findById(cmd.orderId()).filter(r -> !r.isReleased()).ifPresent(r -> {
            StockItem item = stock.findById(r.getSku()).orElseThrow();
            item.setAvailable(item.getAvailable() + r.getQuantity());
            item.setReserved(item.getReserved() - r.getQuantity());
            r.setReleased(true);
            stock.save(item);
            reservations.save(r);
        });
        reply(cmd.orderId(), STEP_RELEASE_STOCK, true, null);
    }

    private void reply(String orderId, String step, boolean success, String reason) {
        outbox.publish(Topics.SAGA_REPLIES, orderId, SAGA_REPLY, new SagaReply(orderId, step, success, reason));
    }
}
