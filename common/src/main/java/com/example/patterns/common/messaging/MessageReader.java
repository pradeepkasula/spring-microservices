package com.example.patterns.common.messaging;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class MessageReader {
    private final ObjectMapper mapper;

    public <T> T read(ConsumerRecord<String, String> record, Class<T> type) {
        try {
            return mapper.readValue(record.value(), type);
        } catch (JsonProcessingException e) {
            throw new IllegalArgumentException("Bad " + type.getSimpleName() + " payload: " + record.value(), e);
        }
    }
}
