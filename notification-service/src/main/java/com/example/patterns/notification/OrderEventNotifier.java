package com.example.patterns.notification;

import com.example.patterns.common.events.Contracts.OrderEvent;
import com.example.patterns.common.events.Topics;
import com.example.patterns.common.messaging.IdempotentConsumer;
import com.example.patterns.common.messaging.MessageReader;
import com.example.patterns.common.messaging.Msg;
import com.example.patterns.common.web.AuditLog;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

/** PATTERN: Domain event subscriber. Replace the log line with an email/SMS/push provider call. */
@Component
@RequiredArgsConstructor
@Slf4j
public class OrderEventNotifier {

    private final IdempotentConsumer idempotent;
    private final MessageReader reader;

    @KafkaListener(topics = Topics.ORDER_EVENTS, groupId = "notification-service")
    public void onOrderEvent(ConsumerRecord<String, String> record) {
        Msg.withCorrelation(record, () -> idempotent.runOnce("notification-service", Msg.id(record), () -> {
            OrderEvent e = reader.read(record, OrderEvent.class);
            String type = Msg.type(record);
            log.info("NOTIFY customer={} : order {} -> {} ({})", e.customerId(), e.orderId(), e.status(), type);
            AuditLog.record("NOTIFICATION_SENT", "orderId=" + e.orderId() + " type=" + type);
        }));
    }
}
