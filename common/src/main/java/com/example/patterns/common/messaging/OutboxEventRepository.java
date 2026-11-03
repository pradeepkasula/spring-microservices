package com.example.patterns.common.messaging;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface OutboxEventRepository extends JpaRepository<OutboxEvent, String> {
    List<OutboxEvent> findTop100BySentFalseOrderByCreatedAtAsc();
}
