package com.example.demo.service;

import com.example.demo.model.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.HttpServerErrorException;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;

@Service
public class FraudService {

    private static final ParameterizedTypeReference<Map<String, Object>> MAP_TYPE = new ParameterizedTypeReference<>() {
    };
    private static final ParameterizedTypeReference<List<Map<String, Object>>> LIST_MAP_TYPE = new ParameterizedTypeReference<>() {
    };

    private final RestTemplate restTemplate;
    private final String baseUrl;

    public FraudService(
            RestTemplate restTemplate,
            @Value("${app.ml.base-url}") String baseUrl) {
        this.restTemplate = restTemplate;
        this.baseUrl = baseUrl;
    }

    private HttpEntity<Object> jsonEntity(Object body) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        return new HttpEntity<>(body, headers);
    }

    private <T> T post(String path, Object body, ParameterizedTypeReference<T> type) {
        try {
            ResponseEntity<T> resp = restTemplate.exchange(
                    baseUrl + path, HttpMethod.POST, jsonEntity(body), type);
            if (resp.getBody() == null)
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                        "ML service returned empty response for " + path);
            return resp.getBody();
        } catch (ResourceAccessException ex) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "ML service is unreachable: " + ex.getMessage());
        } catch (HttpClientErrorException | HttpServerErrorException ex) {
            throw new ResponseStatusException(ex.getStatusCode(),
                    "ML service error: " + ex.getResponseBodyAsString());
        }
    }

    private <T> T get(String path, ParameterizedTypeReference<T> type) {
        try {
            ResponseEntity<T> resp = restTemplate.exchange(
                    baseUrl + path, HttpMethod.GET, null, type);
            if (resp.getBody() == null)
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                        "ML service returned empty response for " + path);
            return resp.getBody();
        } catch (ResourceAccessException ex) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "ML service is unreachable: " + ex.getMessage());
        } catch (HttpClientErrorException | HttpServerErrorException ex) {
            throw new ResponseStatusException(ex.getStatusCode(),
                    "ML service error: " + ex.getResponseBodyAsString());
        }
    }

    /** POST /predict/event — all 4 layers, primary endpoint */
    public FraudResponse predictEvent(FraudEventRequest request) {
        return post("/predict/event", request,
                new ParameterizedTypeReference<FraudResponse>() {
                });
    }

    /** POST /predict/transaction — XGBoost + SHAP only */
    public Map<String, Object> predictTransaction(TransactionRequest request) {
        return post("/predict/transaction", request, MAP_TYPE);
    }

    /** POST /predict/login — Isolation Forest anomaly */
    public Map<String, Object> predictLogin(LoginRequest request) {
        return post("/predict/login", request, MAP_TYPE);
    }

    /** GET /graph/risk/{userId} */
    public Map<String, Object> getGraphRisk(String userId) {
        return get("/graph/risk/" + userId, MAP_TYPE);
    }

    /** GET /graph/risk/all */
    public Map<String, Object> getAllGraphRisks() {
        return get("/graph/risk/all", MAP_TYPE);
    }

    /** POST /batch/transactions — bulk scoring, max 500 */
    public List<Map<String, Object>> batchPredict(List<TransactionRequest> transactions) {
        return post("/batch/transactions", transactions, LIST_MAP_TYPE);
    }

    /** GET /health */
    public Map<String, Object> mlHealth() {
        return get("/health", MAP_TYPE);
    }

    /** GET /model/info */
    public Map<String, Object> modelInfo() {
        return get("/model/info", MAP_TYPE);
    }
}