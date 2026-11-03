package com.example.patterns.gateway;

import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** PATTERN: Circuit breaker (gateway side) - answer quickly with a degraded response when a service is down. */
@RestController
class FallbackController {
    @RequestMapping("/fallback/{service}")
    ResponseEntity<Map<String, String>> fallback(@PathVariable String service) {
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                .body(Map.of("service", service, "message", "Service temporarily unavailable, please retry later"));
    }
}
