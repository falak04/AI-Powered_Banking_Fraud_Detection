package com.example.demo.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;

/**
 * Configures Jackson to serialize Java camelCase fields → snake_case JSON.
 *
 * This is critical for the Spring Boot → Python ML service call:
 *   Java:   userId, logAmount, dayOfWeek, isWeekend ...
 *   Python: user_id, log_amount, day_of_week, is_weekend ...
 *
 * Without this, Python Pydantic raises validation errors for every field.
 *
 * NOTE: This also affects what React receives from Spring Boot.
 * React must therefore use snake_case field names when reading responses,
 * OR we use @JsonProperty on response DTOs to override back to camelCase.
 * The FraudResponse.java already uses @JsonProperty so responses are safe.
 */
@Configuration
public class JacksonConfig {

    @Bean
    @Primary
    public ObjectMapper objectMapper() {
        ObjectMapper mapper = new ObjectMapper();
        mapper.setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE);
        return mapper;
    }
}