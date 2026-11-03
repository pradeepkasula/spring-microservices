package com.example.patterns.query;

import com.example.patterns.common.events.Contracts.OrderEvent;
import com.example.patterns.common.events.Topics;
import com.example.patterns.common.messaging.IdempotentConsumer;
import com.example.patterns.common.messaging.MessageReader;
import com.example.patterns.common.messaging.Msg;
import java.time.Instant;
import lombok.RequiredArgsConstructor;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

/** PATTERN: CQRS - the read model is rebuilt purely from domain events published by the command side. */
@Component
@RequiredArgsConstructor
public class OrderSummaryProjector {

    private final OrderSummaryRepository repository;
    private final IdempotentConsumer idempotent;
    private final MessageReader reader;

    @KafkaListener(topics = Topics.ORDER_EVENTS, groupId = "order-query-service")
    public void onOrderEvent(ConsumerRecord<String, String> record) {
        Msg.withCorrelation(record, () -> idempotent.runOnce("order-query-service", Msg.id(record), () -> {
            OrderEvent e = reader.read(record, OrderEvent.class);
            OrderSummary s = repository.findById(e.orderId()).orElseGet(OrderSummary::new);
            s.setOrderId(e.orderId());
            s.setCustomerId(e.customerId());
            s.setSku(e.sku());
            s.setQuantity(e.quantity());
            s.setAmount(e.amount());
            s.setStatus(e.status());
            s.setReason(e.reason());
            s.setUpdatedAt(Instant.now());
            repository.save(s);
        }));
    }
}
