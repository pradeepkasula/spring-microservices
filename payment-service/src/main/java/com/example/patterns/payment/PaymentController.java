package com.example.patterns.payment;

import com.example.patterns.common.web.NotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
public class PaymentController {

    private final PaymentRepository payments;

    @GetMapping("/payments/{orderId}")
    public Payment get(@PathVariable String orderId) {
        return payments.findById(orderId).orElseThrow(() -> new NotFoundException("No payment for order " + orderId));
    }
}
