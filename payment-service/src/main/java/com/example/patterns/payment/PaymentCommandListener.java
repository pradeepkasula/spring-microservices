package com.example.patterns.payment;

import static com.example.patterns.common.events.Contracts.PROCESS_PAYMENT;
import static com.example.patterns.common.events.Contracts.SAGA_REPLY;
import static com.example.patterns.common.events.Contracts.STEP_PROCESS_PAYMENT;

import com.example.patterns.common.events.Contracts.ProcessPayment;
import com.example.patterns.common.events.Contracts.SagaReply;
import com.example.patterns.common.events.Topics;
import com.example.patterns.common.messaging.IdempotentConsumer;
import com.example.patterns.common.messaging.MessageReader;
import com.example.patterns.common.messaging.Msg;
import com.example.patterns.common.messaging.OutboxService;
import com.example.patterns.common.web.AuditLog;
import java.math.BigDecimal;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

/**
 * Saga participant. The credit limit comes from the config server (Externalized configuration):
 * orders above it are declined, which triggers the compensation of the saga.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class PaymentCommandListener {

    private final PaymentRepository payments;
    private final IdempotentConsumer idempotent;
    private final MessageReader reader;
    private final OutboxService outbox;

    @Value("${payment.credit-limit:1000}")
    private BigDecimal creditLimit;

    @KafkaListener(topics = Topics.PAYMENT_COMMANDS, groupId = "payment-service")
    public void onCommand(ConsumerRecord<String, String> record) {
        Msg.withCorrelation(record, () ->
                idempotent.runOnce("payment-service", Msg.id(record), () -> handle(record)));
    }

    private void handle(ConsumerRecord<String, String> record) {
        if (!PROCESS_PAYMENT.equals(Msg.type(record))) {
            log.warn("Unknown command type {}", Msg.type(record));
            return;
        }
        ProcessPayment cmd = reader.read(record, ProcessPayment.class);
        boolean ok = cmd.amount().compareTo(creditLimit) <= 0;
        payments.save(new Payment(cmd.orderId(), cmd.customerId(), cmd.amount(), ok ? "CAPTURED" : "DECLINED"));
        AuditLog.record(ok ? "PAYMENT_CAPTURED" : "PAYMENT_DECLINED",
                "orderId=" + cmd.orderId() + " amount=" + cmd.amount());
        outbox.publish(Topics.SAGA_REPLIES, cmd.orderId(), SAGA_REPLY,
                new SagaReply(cmd.orderId(), STEP_PROCESS_PAYMENT, ok, ok ? null : "Credit limit exceeded"));
    }
}
