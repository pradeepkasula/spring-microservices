package com.example.patterns.chassis;

import com.example.patterns.common.events.Topics;
import org.apache.kafka.clients.admin.NewTopic;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.AutoConfigurationPackage;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.kafka.config.TopicBuilder;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * PATTERN: Microservice chassis.
 * Every service gets correlation ids, error handling, outbox, idempotent consumer, topics and JPA scanning of the
 * shared entities simply by having this module on the classpath.
 */
@AutoConfiguration
@AutoConfigurationPackage(basePackages = "com.example.patterns.common")
@ComponentScan("com.example.patterns.common")
@EnableScheduling
public class ChassisAutoConfiguration {

    @Bean NewTopic orderEventsTopic() { return TopicBuilder.name(Topics.ORDER_EVENTS).partitions(1).replicas(1).build(); }
    @Bean NewTopic inventoryCommandsTopic() { return TopicBuilder.name(Topics.INVENTORY_COMMANDS).partitions(1).replicas(1).build(); }
    @Bean NewTopic paymentCommandsTopic() { return TopicBuilder.name(Topics.PAYMENT_COMMANDS).partitions(1).replicas(1).build(); }
    @Bean NewTopic sagaRepliesTopic() { return TopicBuilder.name(Topics.SAGA_REPLIES).partitions(1).replicas(1).build(); }
}
