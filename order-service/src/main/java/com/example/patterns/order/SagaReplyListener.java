package com.example.patterns.order;

import com.example.patterns.common.events.Contracts.SagaReply;
import com.example.patterns.common.events.Topics;
import com.example.patterns.common.messaging.IdempotentConsumer;
import com.example.patterns.common.messaging.MessageReader;
import com.example.patterns.common.messaging.Msg;
import lombok.RequiredArgsConstructor;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

/** PATTERNS: Messaging + Idempotent consumer. Replies from participants drive the orchestrator forward. */
@Component
@RequiredArgsConstructor
public class SagaReplyListener {

    private final CreateOrderSaga saga;
    private final IdempotentConsumer idempotent;
    private final MessageReader reader;

    @KafkaListener(topics = Topics.SAGA_REPLIES, groupId = "order-service")
    public void onReply(ConsumerRecord<String, String> record) {
        Msg.withCorrelation(record, () ->
                idempotent.runOnce("order-service", Msg.id(record),
                        () -> saga.onReply(reader.read(record, SagaReply.class))));
    }
}
