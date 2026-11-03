package com.example.patterns.query;

import com.example.patterns.common.web.NotFoundException;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
public class OrderQueryController {

    private final OrderSummaryRepository summaries;
    private final OrderDetailsComposer composer;

    /** CQRS read side: served from the local denormalised table, no calls to other services. */
    @GetMapping("/query/orders")
    public List<OrderSummary> byCustomer(@RequestParam String customerId) {
        return summaries.findByCustomerIdOrderByUpdatedAtDesc(customerId);
    }

    @GetMapping("/query/orders/{id}")
    public OrderSummary one(@PathVariable String id) {
        return summaries.findById(id).orElseThrow(() -> new NotFoundException("Order " + id + " not found"));
    }

    /** API composition: live data from order, payment and inventory services. */
    @GetMapping("/query/orders/{id}/details")
    public Map<String, Object> details(@PathVariable String id) {
        return composer.compose(id);
    }
}
