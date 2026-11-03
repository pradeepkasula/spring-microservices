package com.example.patterns.common.messaging;

import java.time.Instant;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * PATTERN: Idempotent consumer - records processed message ids in the same transaction as the business update,
 * so a redelivered message is detected and skipped.
 */
@Component
@Slf4j
@RequiredArgsConstructor
public class IdempotentConsumer {

    private final ProcessedMessageRepository repository;

    @Transactional
    public boolean runOnce(String consumer, String messageId, Runnable action) {
        String id = consumer + ":" + messageId;
        if (repository.existsById(id)) {
            log.info("Duplicate message {} ignored", id);
            return false;
        }
        repository.save(new ProcessedMessage(id, Instant.now()));
        action.run();
        return true;
    }
}
