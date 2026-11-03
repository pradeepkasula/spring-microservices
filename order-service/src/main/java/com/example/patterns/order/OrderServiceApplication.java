package com.example.patterns.order;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * PATTERNS: Decompose by business capability, Database per service, Self-contained service.
 * Owns the Order aggregate and orchestrates the create-order saga.
 */
@SpringBootApplication
public class OrderServiceApplication {
    public static void main(String[] args) {
        SpringApplication.run(OrderServiceApplication.class, args);
    }
}
