package com.example.patterns.query;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface OrderSummaryRepository extends JpaRepository<OrderSummary, String> {
    List<OrderSummary> findByCustomerIdOrderByUpdatedAtDesc(String customerId);
}
