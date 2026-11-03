package com.example.patterns.query;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.function.Supplier;
import org.springframework.cloud.client.circuitbreaker.CircuitBreakerFactory;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;

/**
 * PATTERN: API composition - one query joins data owned by three services by calling their APIs.
 * PATTERN: Circuit breaker - each downstream call is wrapped; when a service is slow or down the answer is
 * degraded (status UNAVAILABLE for that part) instead of failing or hanging the whole request.
 * PATTERN: Client-side discovery - service names are resolved via the registry by the load-balanced RestClient.
 */
@Service
public class OrderDetailsComposer {

    private static final ParameterizedTypeReference<Map<String, Object>> MAP = new ParameterizedTypeReference<>() {};

    private final RestClient rest;
    private final CircuitBreakerFactory<?, ?> breakers;

    public OrderDetailsComposer(RestClient.Builder loadBalanced, CircuitBreakerFactory<?, ?> breakers) {
        this.rest = loadBalanced.build();
        this.breakers = breakers;
    }

    public Map<String, Object> compose(String orderId) {
        Map<String, Object> order = call("order-service", "/orders/" + orderId);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("order", order);
        result.put("payment", call("payment-service", "/payments/" + orderId));
        Object sku = order.get("sku");
        result.put("stock", sku == null ? Map.of("status", "UNKNOWN") : call("inventory-service", "/inventory/" + sku));
        return result;
    }

    private Map<String, Object> call(String service, String path) {
        Supplier<Map<String, Object>> request = () -> {
            try {
                return rest.get().uri("http://" + service + path).retrieve().body(MAP);
            } catch (HttpClientErrorException.NotFound e) {
                return Map.of("status", "NOT_FOUND"); // a business answer, not a failure of the dependency
            }
        };
        return breakers.create(service).run(request, t -> Map.of("status", "UNAVAILABLE", "service", service));
    }
}
