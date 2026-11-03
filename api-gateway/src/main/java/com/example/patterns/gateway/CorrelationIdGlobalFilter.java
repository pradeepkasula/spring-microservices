package com.example.patterns.gateway;

import java.util.UUID;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.http.HttpHeaders;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.http.server.reactive.ServerHttpRequestDecorator;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

/** Creates X-Correlation-Id at the edge so every log line and Kafka message of one request can be joined. */
@Component
class CorrelationIdGlobalFilter implements GlobalFilter, Ordered {
    static final String HEADER = "X-Correlation-Id";

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        String cid = exchange.getRequest().getHeaders().getFirst(HEADER);
        if (cid == null || cid.isBlank()) {
            cid = UUID.randomUUID().toString();
            // incoming headers are read-only: decorate the request with a writable copy
            HttpHeaders writable = new HttpHeaders();
            writable.putAll(exchange.getRequest().getHeaders());
            writable.set(HEADER, cid);
            ServerHttpRequest req = new ServerHttpRequestDecorator(exchange.getRequest()) {
                @Override
                public HttpHeaders getHeaders() {
                    return writable;
                }
            };
            exchange = exchange.mutate().request(req).build();
        }
        String correlationId = cid;
        ServerWebExchange current = exchange;
        current.getResponse().beforeCommit(() -> {
            current.getResponse().getHeaders().set(HEADER, correlationId);
            return Mono.empty();
        });
        return chain.filter(current);
    }

    @Override
    public int getOrder() {
        return Ordered.HIGHEST_PRECEDENCE;
    }
}
