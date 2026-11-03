package com.example.patterns.localkafka;

import org.springframework.kafka.test.EmbeddedKafkaBroker;
import org.springframework.kafka.test.EmbeddedKafkaKraftBroker;

/** Dev-only: Kafka on localhost:9092 without Docker. Data is lost on exit. */
public class LocalKafka {
    public static void main(String[] args) throws Exception {
        EmbeddedKafkaBroker broker = new EmbeddedKafkaKraftBroker(1, 1).kafkaPorts(9092);
        broker.afterPropertiesSet();
        System.out.println("LOCAL KAFKA READY on " + broker.getBrokersAsString());
        Thread.currentThread().join();
    }
}
