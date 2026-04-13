package com.example.demo.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.springframework.web.client.RestTemplate;
import java.util.List;

@Configuration
public class AppConfig {

    @Value("${app.ml.connect-timeout:5000}")
    private int connectTimeout;

    @Value("${app.ml.read-timeout:15000}")
    private int readTimeout;

    @Bean
    public RestTemplate restTemplate(ObjectMapper objectMapper) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(connectTimeout);
        factory.setReadTimeout(readTimeout);

        RestTemplate restTemplate = new RestTemplate(factory);
        List<org.springframework.http.converter.HttpMessageConverter<?>> converters =
                restTemplate.getMessageConverters();
        converters.removeIf(MappingJackson2HttpMessageConverter.class::isInstance);
        converters.add(new MappingJackson2HttpMessageConverter(objectMapper));

        return restTemplate;
    }

    @Bean
    public WebMvcConfigurer corsConfigurer() {
        return new WebMvcConfigurer() {
            @Override
            public void addCorsMappings(CorsRegistry registry) {
                registry.addMapping("/fraud/**")
                        .allowedOrigins("http://localhost:3000")
                        .allowedMethods("GET", "POST", "OPTIONS")
                        .allowedHeaders("*");
            }
        };
    }
}
