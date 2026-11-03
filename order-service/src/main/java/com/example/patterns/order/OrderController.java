package com.example.patterns.order;

import com.example.patterns.common.web.NotFoundException;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** PATTERN: Remote procedure invocation (REST) for the synchronous API, messaging for the saga steps. */
@RestController
@RequiredArgsConstructor
public class OrderController {

    private final CreateOrderSaga saga;
    private final OrderRepository orders;

    /** 202 Accepted: the order stays PENDING until the saga finishes. */
    @PostMapping("/orders")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public Order create(@Valid @RequestBody CreateOrderRequest request) {
        return saga.start(request);
    }

    @GetMapping("/orders/{id}")
    public Order get(@PathVariable String id) {
        return orders.findById(id).orElseThrow(() -> new NotFoundException("Order " + id + " not found"));
    }
}
