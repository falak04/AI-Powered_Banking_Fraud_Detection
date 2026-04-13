package com.example.demo.entity;

import jakarta.persistence.*;

import java.time.Instant;

@Entity
@Table(name = "alert_records", indexes = {
        @Index(name = "idx_alert_occurred_at", columnList = "occurredAt"),
        @Index(name = "idx_alert_user_id", columnList = "userId"),
        @Index(name = "idx_alert_event_id", columnList = "eventId")
})
public class AlertRecord {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Instant occurredAt;

    @Column(length = 64)
    private String eventId;

    @Column(nullable = false, length = 64)
    private String userId;

    @Column(length = 64)
    private String deviceId;

    @Column(length = 64)
    private String employeeId;

    private Double combinedRiskScore;

    private Double graphRiskScore;

    private Boolean alertSoc;

    @Lob
    @Column(columnDefinition = "LONGTEXT", nullable = false)
    private String responseJson;

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Instant getOccurredAt() {
        return occurredAt;
    }

    public void setOccurredAt(Instant occurredAt) {
        this.occurredAt = occurredAt;
    }

    public String getEventId() {
        return eventId;
    }

    public void setEventId(String eventId) {
        this.eventId = eventId;
    }

    public String getUserId() {
        return userId;
    }

    public void setUserId(String userId) {
        this.userId = userId;
    }

    public String getDeviceId() {
        return deviceId;
    }

    public void setDeviceId(String deviceId) {
        this.deviceId = deviceId;
    }

    public String getEmployeeId() {
        return employeeId;
    }

    public void setEmployeeId(String employeeId) {
        this.employeeId = employeeId;
    }

    public Double getCombinedRiskScore() {
        return combinedRiskScore;
    }

    public void setCombinedRiskScore(Double combinedRiskScore) {
        this.combinedRiskScore = combinedRiskScore;
    }

    public Double getGraphRiskScore() {
        return graphRiskScore;
    }

    public void setGraphRiskScore(Double graphRiskScore) {
        this.graphRiskScore = graphRiskScore;
    }

    public Boolean getAlertSoc() {
        return alertSoc;
    }

    public void setAlertSoc(Boolean alertSoc) {
        this.alertSoc = alertSoc;
    }

    public String getResponseJson() {
        return responseJson;
    }

    public void setResponseJson(String responseJson) {
        this.responseJson = responseJson;
    }
}
