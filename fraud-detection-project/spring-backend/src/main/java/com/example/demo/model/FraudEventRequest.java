package com.example.demo.model;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * Combined event wrapper — React sends this to Spring Boot.
 * Spring Boot forwards it to Python /predict/event.
 * At least one of transaction or login must be non-null.
 */
public class FraudEventRequest {

    private TransactionRequest transaction;
    private LoginRequest login;

    @JsonProperty("device_id")
    @JsonAlias("deviceId")
    private String deviceId;

    @JsonProperty("employee_id")
    @JsonAlias("employeeId")
    private String employeeId;

    public TransactionRequest getTransaction() {
        return transaction;
    }

    public void setTransaction(TransactionRequest t) {
        this.transaction = t;
    }

    public LoginRequest getLogin() {
        return login;
    }

    public void setLogin(LoginRequest login) {
        this.login = login;
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
}
