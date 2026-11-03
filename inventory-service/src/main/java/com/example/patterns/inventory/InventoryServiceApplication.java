package com.example.patterns.inventory;

import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;

/** Saga participant owning stock levels (Database per service). */
@SpringBootApplication
public class InventoryServiceApplication {
    public static void main(String[] args) {
        SpringApplication.run(InventoryServiceApplication.class, args);
    }

    @Bean
    CommandLineRunner seed(StockItemRepository repo) {
        return args -> {
            if (repo.count() == 0) {
                repo.save(new StockItem("BOOK-1", 100, 0));
                repo.save(new StockItem("LAPTOP-1", 5, 0));
            }
        };
    }
}
