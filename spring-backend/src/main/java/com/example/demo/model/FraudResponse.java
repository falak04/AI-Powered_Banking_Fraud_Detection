package com.example.demo.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;

// ─────────────────────────────────────────────────────────────────────────────
// SHAP explanation entry
// ─────────────────────────────────────────────────────────────────────────────
@JsonIgnoreProperties(ignoreUnknown = true)
class ShapExplanation {

    private String feature;

    @JsonProperty("shap_value")
    private Double shapValue;

    private String direction;
    private Integer rank;

    public String getFeature()              { return feature; }
    public void setFeature(String f)        { this.feature = f; }

    public Double getShapValue()            { return shapValue; }
    public void setShapValue(Double v)      { this.shapValue = v; }

    public String getDirection()            { return direction; }
    public void setDirection(String d)      { this.direction = d; }

    public Integer getRank()                { return rank; }
    public void setRank(Integer r)          { this.rank = r; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Security action (Layer 4 decision)
// ─────────────────────────────────────────────────────────────────────────────
@JsonIgnoreProperties(ignoreUnknown = true)
class SecurityAction {

    private String code;           // ALLOW | OTP_MFA | LOCK_ACCOUNT | BLOCK_ALERT_SOC
    private String description;
    private String severity;       // low | medium | high | critical

    public String getCode()                  { return code; }
    public void setCode(String code)         { this.code = code; }

    public String getDescription()           { return description; }
    public void setDescription(String d)     { this.description = d; }

    public String getSeverity()              { return severity; }
    public void setSeverity(String s)        { this.severity = s; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Transaction ML result (from /predict/transaction)
// ─────────────────────────────────────────────────────────────────────────────
@JsonIgnoreProperties(ignoreUnknown = true)
class TransactionResult {

    @JsonProperty("ml_fraud_score")
    private Double mlFraudScore;

    @JsonProperty("is_fraud")
    private Boolean isFraud;

    @JsonProperty("anomaly_score")
    private Double anomalyScore;

    @JsonProperty("shap_explanation")
    private List<ShapExplanation> shapExplanation;

    public Double getMlFraudScore()                          { return mlFraudScore; }
    public void setMlFraudScore(Double v)                    { this.mlFraudScore = v; }

    public Boolean getIsFraud()                              { return isFraud; }
    public void setIsFraud(Boolean v)                        { this.isFraud = v; }

    public Double getAnomalyScore()                          { return anomalyScore; }
    public void setAnomalyScore(Double v)                    { this.anomalyScore = v; }

    public List<ShapExplanation> getShapExplanation()        { return shapExplanation; }
    public void setShapExplanation(List<ShapExplanation> v)  { this.shapExplanation = v; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Graph risk result (Layer 3)
// ─────────────────────────────────────────────────────────────────────────────
@JsonIgnoreProperties(ignoreUnknown = true)
class GraphResult {

    @JsonProperty("graph_risk_score")
    private Double graphRiskScore;

    @JsonProperty("user_in_graph")
    private Boolean userInGraph;

    public Double getGraphRiskScore()              { return graphRiskScore; }
    public void setGraphRiskScore(Double v)        { this.graphRiskScore = v; }

    public Boolean getUserInGraph()                { return userInGraph; }
    public void setUserInGraph(Boolean v)          { this.userInGraph = v; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Full fraud event response (from /predict/event) — primary response for React
// ─────────────────────────────────────────────────────────────────────────────
@JsonIgnoreProperties(ignoreUnknown = true)
public class FraudResponse {

    @JsonProperty("event_id")
    private String eventId;

    @JsonProperty("user_id")
    private String userId;

    private String timestamp;

    @JsonProperty("combined_risk_score")
    private Double combinedRiskScore;

    @JsonProperty("security_action")
    private SecurityAction securityAction;

    @JsonProperty("transaction_result")
    private TransactionResult transactionResult;

    @JsonProperty("graph_result")
    private GraphResult graphResult;

    @JsonProperty("alert_soc")
    private Boolean alertSoc;

    @JsonProperty("log_to_db")
    private Boolean logToDb;

    // ── Getters & Setters ──────────────────────────────────────────────────

    public String getEventId()                           { return eventId; }
    public void setEventId(String v)                     { this.eventId = v; }

    public String getUserId()                            { return userId; }
    public void setUserId(String v)                      { this.userId = v; }

    public String getTimestamp()                         { return timestamp; }
    public void setTimestamp(String v)                   { this.timestamp = v; }

    public Double getCombinedRiskScore()                 { return combinedRiskScore; }
    public void setCombinedRiskScore(Double v)           { this.combinedRiskScore = v; }

    public SecurityAction getSecurityAction()            { return securityAction; }
    public void setSecurityAction(SecurityAction v)      { this.securityAction = v; }

    public TransactionResult getTransactionResult()      { return transactionResult; }
    public void setTransactionResult(TransactionResult v){ this.transactionResult = v; }

    public GraphResult getGraphResult()                  { return graphResult; }
    public void setGraphResult(GraphResult v)            { this.graphResult = v; }

    public Boolean getAlertSoc()                         { return alertSoc; }
    public void setAlertSoc(Boolean v)                   { this.alertSoc = v; }

    public Boolean getLogToDb()                          { return logToDb; }
    public void setLogToDb(Boolean v)                    { this.logToDb = v; }

    public String getSecurityActionCode() {
        return securityAction != null ? securityAction.getCode() : null;
    }

    public String getSecurityActionSeverity() {
        return securityAction != null ? securityAction.getSeverity() : null;
    }

    public String getSecurityActionDescription() {
        return securityAction != null ? securityAction.getDescription() : null;
    }

    public Double getTransactionMlFraudScore() {
        return transactionResult != null ? transactionResult.getMlFraudScore() : null;
    }

    public Double getTransactionAnomalyScore() {
        return transactionResult != null ? transactionResult.getAnomalyScore() : null;
    }

    public Double getGraphRiskScore() {
        return graphResult != null ? graphResult.getGraphRiskScore() : null;
    }

    public Boolean getUserInGraph() {
        return graphResult != null ? graphResult.getUserInGraph() : null;
    }
}
