package com.example.patterns.inventory;

import static org.assertj.core.api.Assertions.assertThat;

import com.example.patterns.common.events.Contracts;
import com.example.patterns.common.messaging.Msg;
import com.example.patterns.common.messaging.OutboxEvent;
import com.example.patterns.common.messaging.OutboxEventRepository;
import java.nio.charset.StandardCharsets;
import java.util.List;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

/**
 * PATTERN: Consumer-driven contract test (hand-rolled). The JSON below is what the consumer (inventory) expects
 * the order service to send. The same sample can be replayed in the producer build; Spring Cloud Contract or
 * Pact automate that exchange. Also covers Idempotent consumer: a redelivered message changes nothing.
 */
@SpringBootTest(properties = {
        "eureka.client.enabled=false",
        "spring.cloud.config.enabled=false",
        "spring.kafka.listener.auto-startup=false",
        "spring.kafka.admin.auto-create=false",
        "patterns.outbox.enabled=false",
        "management.tracing.enabled=false",
        "spring.datasource.url=jdbc:h2:mem:inventorytest;DB_CLOSE_DELAY=-1"
})
class ReserveStockContractTest {

    static final String RESERVE_JSON = "{\"orderId\":\"o-1\",\"sku\":\"BOOK-1\",\"quantity\":3}";

    @Autowired InventoryCommandListener listener;
    @Autowired StockItemRepository stock;
    @Autowired OutboxEventRepository outbox;

    private ConsumerRecord<String, String> record(String messageId, String type, String json) {
        ConsumerRecord<String, String> r = new ConsumerRecord<>("inventory-commands", 0, 0, "o-1", json);
        r.headers().add(Msg.MESSAGE_ID, messageId.getBytes(StandardCharsets.UTF_8));
        r.headers().add(Msg.TYPE, type.getBytes(StandardCharsets.UTF_8));
        return r;
    }

    @Test
    void reservesStockRepliesSuccessAndIgnoresDuplicate() {
        int before = stock.findById("BOOK-1").orElseThrow().getAvailable();

        listener.onCommand(record("m-1", Contracts.RESERVE_STOCK, RESERVE_JSON));
        listener.onCommand(record("m-1", Contracts.RESERVE_STOCK, RESERVE_JSON)); // duplicate delivery

        assertThat(stock.findById("BOOK-1").orElseThrow().getAvailable()).isEqualTo(before - 3);
        List<OutboxEvent> replies = outbox.findAll().stream().filter(e -> "o-1".equals(e.getMessageKey())).toList();
        assertThat(replies).hasSize(1);
        assertThat(replies.get(0).getEventType()).isEqualTo(Contracts.SAGA_REPLY);
        assertThat(replies.get(0).getPayload()).contains("\"success\":true").contains("RESERVE_STOCK");
    }

    @Test
    void repliesFailureWhenStockIsInsufficient() {
        listener.onCommand(record("m-2", Contracts.RESERVE_STOCK,
                "{\"orderId\":\"o-2\",\"sku\":\"LAPTOP-1\",\"quantity\":999}"));

        OutboxEvent reply = outbox.findAll().stream().filter(e -> "o-2".equals(e.getMessageKey())).findFirst().orElseThrow();
        assertThat(reply.getPayload()).contains("\"success\":false").contains("Insufficient stock");
    }
}
