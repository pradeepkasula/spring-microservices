package com.example.patterns.inventory;

import com.example.patterns.common.web.NotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
public class InventoryController {

    private final StockItemRepository stock;

    @GetMapping("/inventory/{sku}")
    public StockItem get(@PathVariable String sku) {
        return stock.findById(sku).orElseThrow(() -> new NotFoundException("Unknown sku " + sku));
    }
}
