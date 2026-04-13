package com.example.demo.service;

import com.example.demo.entity.AlertRecord;
import com.example.demo.entity.LoginRecord;
import com.example.demo.model.FraudEventRequest;
import com.example.demo.model.FraudResponse;
import com.example.demo.model.LoginRequest;
import com.example.demo.repository.AlertRecordRepository;
import com.example.demo.repository.LoginRecordRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.Pageable;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class DashboardStateServiceTest {

    @Test
    void buildsSnapshotWithAlertAndLoginRelationships() {
        AlertRecordRepository alertRepository = mock(AlertRecordRepository.class);
        LoginRecordRepository loginRepository = mock(LoginRecordRepository.class);
        DashboardStateService service = new DashboardStateService(
                alertRepository,
                loginRepository,
                new ObjectMapper()
        );

        FraudEventRequest request = new FraudEventRequest();
        request.setDeviceId("D014");
        request.setEmployeeId("E039");

        FraudResponse response = new FraudResponse();
        response.setEventId("EVT-TEST-001");
        response.setUserId("C1013");
        response.setTimestamp("2026-04-03T12:00:00Z");
        response.setCombinedRiskScore(0.742);
        response.setAlertSoc(true);

        service.storeAlert(request, response);

        LoginRequest login = new LoginRequest();
        login.setUserId("C1013");
        login.setTimestamp("2026-04-03T12:05:00Z");
        login.setHour(12);
        login.setDayOfWeek(5);
        login.setHourDeviation(1.5);
        login.setTimeDiff(30.0);
        login.setDormantLogin(0);
        login.setLoginFreq7d(8);
        login.setDistFromHome(12.0);
        login.setDistance(8.0);
        login.setSpeed(25.0);
        login.setImpossibleTravel(0);
        login.setVpn(0);
        login.setIsNewDevice(1);
        login.setCityCode(11);
        login.setDeviceCode(14);

        service.storeLogin(login, Map.of(
                "anomaly_score", 0.67,
                "is_anomaly", true
        ));

        AlertRecord storedAlert = new AlertRecord();
        storedAlert.setOccurredAt(java.time.Instant.parse("2026-04-03T12:00:00Z"));
        storedAlert.setEventId("EVT-TEST-001");
        storedAlert.setUserId("C1013");
        storedAlert.setDeviceId("D014");
        storedAlert.setEmployeeId("E039");
        storedAlert.setCombinedRiskScore(0.742);
        storedAlert.setGraphRiskScore(0.546);
        storedAlert.setAlertSoc(true);
        storedAlert.setResponseJson(new ObjectMapper().valueToTree(response).toString());

        LoginRecord storedLogin = new LoginRecord();
        storedLogin.setOccurredAt(java.time.Instant.parse("2026-04-03T12:05:00Z"));
        storedLogin.setUserId("C1013");
        storedLogin.setDeviceId("D014");
        storedLogin.setDeviceCode(14);
        storedLogin.setAnomalyScore(0.67);
        storedLogin.setIsAnomaly(true);

        when(alertRepository.save(any(AlertRecord.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(loginRepository.save(any(LoginRecord.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(alertRepository.findAllByOrderByOccurredAtDescIdDesc(any(Pageable.class))).thenReturn(List.of(storedAlert));
        when(loginRepository.findAllByOrderByOccurredAtDescIdDesc(any(Pageable.class))).thenReturn(List.of(storedLogin));
        when(alertRepository.count()).thenReturn(1L);
        when(loginRepository.count()).thenReturn(1L);

        Map<String, Object> snapshot = service.buildSnapshot();
        assertNotNull(snapshot.get("timeline"));
        assertNotNull(snapshot.get("heatmap"));
        assertNotNull(snapshot.get("graph"));
    }
}
