package com.example.patterns.order;

import static org.assertj.core.api.Assertions.assertThat;

import com.example.patterns.common.events.Contracts;
import com.example.patterns.common.events.Contracts.SagaReply;
import com.example.patterns.common.messaging.OutboxEvent;
import com.example.patterns.common.messaging.OutboxEventRepository;
import java.math.BigDecimal;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

/**
 * PATTERN: Service component test - the whole order service (real Spring context, real database) is tested in
 * isolation. Kafka is switched off; saga replies are fed in directly and the outbox shows what would be sent.
 */
@SpringBootTest(properties = {
        "eureka.client.enabled=false",
        "spring.cloud.config.enabled=false",
        "spring.kafka.listener.auto-startup=false",
        "spring.kafka.admin.auto-create=false",
        "patterns.outbox.enabled=false",
        "management.tracing.enabled=false",
        "spring.datasource.url=jdbc:h2:mem:ordertest;DB_CLOSE_DELAY=-1"
})
class OrderSagaComponentTest {

    @Autowired CreateOrderSaga saga;
    @Autowired OrderRepository orders;
    @Autowired SagaInstanceRepository sagas;
    @Autowired OutboxEventRepository outbox;

    private Order newOrder() {
        return saga.start(new CreateOrderRequest("c1", "BOOK-1", 2, new BigDecimal("40.00")));
    }

    private List<String> outboxTypesFor(String orderId) {
        return outbox.findAll().stream().filter(e -> orderId.equals(e.getMessageKey()))
                .sorted((a, b) -> a.getCreatedAt().compareTo(b.getCreatedAt()))
                .map(OutboxEvent::getEventType).toList();
    }

    @Test
    void happyPathApprovesOrder() {
        Order o = newOrder();
        assertThat(o.getStatus()).isEqualTo(OrderStatus.PENDING);

        saga.onReply(new SagaReply(o.getId(), Contracts.STEP_RESERVE_STOCK, true, null));
        saga.onReply(new SagaReply(o.getId(), Contracts.STEP_PROCESS_PAYMENT, true, null));

        assertThat(orders.findById(o.getId()).orElseThrow().getStatus()).isEqualTo(OrderStatus.APPROVED);
        assertThat(sagas.findById(o.getId()).orElseThrow().getState()).isEqualTo(SagaState.COMPLETED);
        assertThat(outboxTypesFor(o.getId())).containsExactlyInAnyOrder(
                Contracts.ORDER_CREATED, Contracts.RESERVE_STOCK, Contracts.PROCESS_PAYMENT, Contracts.ORDER_APPROVED);
    }

    @Test
    void paymentFailureCompensatesAndRejectsOrder() {
        Order o = newOrder();

        saga.onReply(new SagaReply(o.getId(), Contracts.STEP_RESERVE_STOCK, true, null));
        saga.onReply(new SagaReply(o.getId(), Contracts.STEP_PROCESS_PAYMENT, false, "Credit limit exceeded"));
        assertThat(sagas.findById(o.getId()).orElseThrow().getState()).isEqualTo(SagaState.RELEASING_STOCK);

        saga.onReply(new SagaReply(o.getId(), Contracts.STEP_RELEASE_STOCK, true, null));

        Order done = orders.findById(o.getId()).orElseThrow();
        assertThat(done.getStatus()).isEqualTo(OrderStatus.REJECTED);
        assertThat(done.getReason()).isEqualTo("Credit limit exceeded");
        assertThat(outboxTypesFor(o.getId())).contains(Contracts.RELEASE_STOCK, Contracts.ORDER_REJECTED);
    }

    @Test
    void outOfStockRejectsWithoutCompensation() {
        Order o = newOrder();
        saga.onReply(new SagaReply(o.getId(), Contracts.STEP_RESERVE_STOCK, false, "Insufficient stock for BOOK-1"));

        assertThat(orders.findById(o.getId()).orElseThrow().getStatus()).isEqualTo(OrderStatus.REJECTED);
        assertThat(outboxTypesFor(o.getId())).doesNotContain(Contracts.RELEASE_STOCK, Contracts.PROCESS_PAYMENT);
    }
}
