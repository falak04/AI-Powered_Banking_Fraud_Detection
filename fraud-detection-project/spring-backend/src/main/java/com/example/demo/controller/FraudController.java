package com.example.demo.controller;

import com.example.demo.model.*;
import com.example.demo.service.DashboardStateService;
import com.example.demo.service.FraudService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * REST controller — React frontend calls these endpoints.
 * Spring Boot acts as a gateway between React and the Python ML service.
 *
 * Base path: /fraud
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │ React → Spring Boot (:8080/fraud/*) → Python ML (:8000/*) │
 * └─────────────────────────────────────────────────────────────────────┘
 */
@CrossOrigin(origins = "*")
@RestController
@RequestMapping("/fraud")
public class FraudController {

    private final FraudService service;
    private final DashboardStateService dashboardState;

    public FraudController(FraudService service, DashboardStateService dashboardState) {
        this.service = service;
        this.dashboardState = dashboardState;
    }

    // ── Primary endpoint (SOC Dashboard + transaction checker) ────────────

    /**
     * POST /fraud/event
     *
     * Main endpoint. React sends the assembled fraud event (transaction and/or
     * login payload). Returns combined risk score, security action, SHAP
     * explanation, and graph risk — everything the SOC dashboard needs.
     *
     * Request body example:
     * {
     * "transaction": { "userId": "C10005", "amount": 5000, ... },
     * "login": { "userId": "C10005", "vpn": 1, ... } ← optional
     * }
     */
    @PostMapping("/event")
    public ResponseEntity<FraudResponse> predictEvent(
            @Valid @RequestBody FraudEventRequest request) {
        FraudResponse response = service.predictEvent(request);
        dashboardState.storeAlert(request, response);
        return ResponseEntity.ok(response);
    }

    // ── Individual model endpoints ─────────────────────────────────────────

    /**
     * POST /fraud/predict/transaction
     * XGBoost score + SHAP explanation only (no graph).
     * Use when you only have transaction data and no login context.
     */
    @PostMapping("/predict/transaction")
    public ResponseEntity<Map<String, Object>> predictTransaction(
            @Valid @RequestBody TransactionRequest request) {
        return ResponseEntity.ok(service.predictTransaction(request));
    }

    /**
     * POST /fraud/predict/login
     * Isolation Forest anomaly score for login events.
     * React Login Heatmap panel calls this on each login.
     */
    @PostMapping("/predict/login")
    public ResponseEntity<Map<String, Object>> predictLogin(
            @Valid @RequestBody LoginRequest request) {
        Map<String, Object> response = service.predictLogin(request);
        dashboardState.storeLogin(request, response);
        return ResponseEntity.ok(response);
    }

    // ── Graph risk (Fraud Network Graph panel) ─────────────────────────────

    /**
     * GET /fraud/graph/risk/{userId}
     * Pre-computed graph risk score for a single user.
     * React Fraud Network Graph calls this to colour individual nodes.
     */
    @GetMapping("/graph/risk/{userId}")
    public ResponseEntity<Map<String, Object>> getGraphRisk(
            @PathVariable String userId) {
        return ResponseEntity.ok(service.getGraphRisk(userId));
    }

    /**
     * GET /fraud/graph/risk
     * All graph risk scores — full network snapshot.
     * React renders the entire fraud network graph from this.
     */
    @GetMapping("/graph/risk")
    public ResponseEntity<Map<String, Object>> getAllGraphRisks() {
        return ResponseEntity.ok(service.getAllGraphRisks());
    }

    /**
     * GET /fraud/dashboard/snapshot
     * Stored session analytics for graph, timeline, heatmap, and recent alerts.
     */
    @GetMapping("/dashboard/snapshot")
    public ResponseEntity<Map<String, Object>> dashboardSnapshot() {
        return ResponseEntity.ok(dashboardState.buildSnapshot());
    }

    // ── Batch ──────────────────────────────────────────────────────────────

    /**
     * POST /fraud/batch
     * Bulk fraud scoring — max 500 transactions.
     * Used by SOC dashboard for historical sweep / bulk review.
     */
    @PostMapping("/batch")
    public ResponseEntity<List<Map<String, Object>>> batchPredict(
            @RequestBody List<@Valid TransactionRequest> transactions) {
        return ResponseEntity.ok(service.batchPredict(transactions));
    }

    // ── Health & metadata ──────────────────────────────────────────────────

    /**
     * GET /fraud/health
     * Checks if Python ML service is alive.
     * React dashboard status indicator calls this on load.
     */
    @GetMapping("/health")
    public ResponseEntity<Map<String, Object>> mlHealth() {
        return ResponseEntity.ok(service.mlHealth());
    }

    /**
     * GET /fraud/model/info
     * Returns model metrics (ROC-AUC, PR-AUC), feature lists, thresholds.
     * React AI Explanation panel displays this.
     */
    @GetMapping("/model/info")
    public ResponseEntity<Map<String, Object>> modelInfo() {
        return ResponseEntity.ok(service.modelInfo());
    }
}
