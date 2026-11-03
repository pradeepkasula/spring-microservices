package com.example.patterns.inventory;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "stock_item")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor
public class StockItem {
    @Id private String sku;
    private int available;
    private int reserved;
}
