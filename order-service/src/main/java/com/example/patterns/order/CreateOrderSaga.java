package com.example.patterns.order;

import static com.example.patterns.common.events.Contracts.ORDER_APPROVED;
import static com.example.patterns.common.events.Contracts.ORDER_CREATED;
import static com.example.patterns.common.events.Contracts.ORDER_REJECTED;
import static com.example.patterns.common.events.Contracts.PROCESS_PAYMENT;
import static com.example.patterns.common.events.Contracts.RELEASE_STOCK;
import static com.example.patterns.common.events.Contracts.RESERVE_STOCK;

import com.example.patterns.common.events.Contracts.OrderEvent;
import com.example.patterns.common.events.Contracts.ProcessPayment;
import com.example.patterns.common.events.Contracts.ReleaseStock;
import com.example.patterns.common.events.Contracts.ReserveStock;
import com.example.patterns.common.events.Contracts.SagaReply;
import com.example.patterns.common.events.Topics;
import com.example.patterns.common.messaging.OutboxService;
import com.example.patterns.common.web.AuditLog;
import com.example.patterns.common.web.NotFoundException;
import java.time.Instant;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * PATTERN: Saga (orchestration). A distributed business transaction is a sequence of local transactions:
 *   1. order created PENDING  2. inventory reserves stock  3. payment is charged  4. order APPROVED
 * If payment fails, a compensating transaction releases the stock and the order is REJECTED.
 * Every step writes its state AND the next command in ONE local transaction (Transactional outbox).
 * PATTERN: Domain event - OrderCreated/Approved/Rejected are published for other services (CQRS, notifications).
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class CreateOrderSaga {

    private final OrderRepository orders;
    private final SagaInstanceRepository sagas;
    private final OutboxService outbox;

    @Transactional
    public Order start(CreateOrderRequest req) {
        Order o = new Order();
        o.setId(UUID.randomUUID().toString());
        o.setCustomerId(req.customerId());
        o.setSku(req.sku());
        o.setQuantity(req.quantity());
        o.setAmount(req.amount());
        o.setStatus(OrderStatus.PENDING);
        o.setCreatedAt(Instant.now());
        orders.save(o);

        SagaInstance s = new SagaInstance();
        s.setOrderId(o.getId());
        s.setState(SagaState.RESERVING_STOCK);
        s.setUpdatedAt(Instant.now());
        sagas.save(s);

        outbox.publish(Topics.ORDER_EVENTS, o.getId(), ORDER_CREATED, event(o));
        outbox.publish(Topics.INVENTORY_COMMANDS, o.getId(), RESERVE_STOCK,
                new ReserveStock(o.getId(), o.getSku(), o.getQuantity()));
        AuditLog.record("ORDER_CREATED", "orderId=" + o.getId() + " customer=" + o.getCustomerId());
        return o;
    }

    @Transactional
    public void onReply(SagaReply reply) {
        SagaInstance s = sagas.findById(reply.orderId())
                .orElseThrow(() -> new NotFoundException("No saga for order " + reply.orderId()));
        Order o = orders.findById(reply.orderId())
                .orElseThrow(() -> new NotFoundException("No order " + reply.orderId()));
        log.info("Saga {} in {} received {} success={}", o.getId(), s.getState(), reply.step(), reply.success());

        switch (s.getState()) {
            case RESERVING_STOCK -> {
                if (reply.success()) {
                    move(s, SagaState.PROCESSING_PAYMENT, null);
                    outbox.publish(Topics.PAYMENT_COMMANDS, o.getId(), PROCESS_PAYMENT,
                            new ProcessPayment(o.getId(), o.getCustomerId(), o.getAmount()));
                } else {
                    finish(o, s, OrderStatus.REJECTED, reply.reason());
                }
            }
            case PROCESSING_PAYMENT -> {
                if (reply.success()) {
                    finish(o, s, OrderStatus.APPROVED, null);
                } else {
                    // compensating transaction
                    move(s, SagaState.RELEASING_STOCK, reply.reason());
                    outbox.publish(Topics.INVENTORY_COMMANDS, o.getId(), RELEASE_STOCK, new ReleaseStock(o.getId()));
                }
            }
            case RELEASING_STOCK -> finish(o, s, OrderStatus.REJECTED, s.getFailureReason());
            default -> log.info("Saga {} already {}, reply ignored", o.getId(), s.getState());
        }
    }

    private void move(SagaInstance s, SagaState next, String reason) {
        s.setState(next);
        if (reason != null) s.setFailureReason(reason);
        s.setUpdatedAt(Instant.now());
    }

    private void finish(Order o, SagaInstance s, OrderStatus status, String reason) {
        o.setStatus(status);
        o.setReason(reason);
        move(s, status == OrderStatus.APPROVED ? SagaState.COMPLETED : SagaState.FAILED, reason);
        outbox.publish(Topics.ORDER_EVENTS, o.getId(),
                status == OrderStatus.APPROVED ? ORDER_APPROVED : ORDER_REJECTED, event(o));
        AuditLog.record("ORDER_" + status, "orderId=" + o.getId() + (reason == null ? "" : " reason=" + reason));
    }

    private OrderEvent event(Order o) {
        return new OrderEvent(o.getId(), o.getCustomerId(), o.getSku(), o.getQuantity(), o.getAmount(),
                o.getStatus().name(), o.getReason());
    }
}
