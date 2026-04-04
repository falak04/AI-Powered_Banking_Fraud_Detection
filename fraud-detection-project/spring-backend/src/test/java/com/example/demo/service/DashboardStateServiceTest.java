package com.example.demo.service;

import com.example.demo.model.FraudEventRequest;
import com.example.demo.model.FraudResponse;
import com.example.demo.model.LoginRequest;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class DashboardStateServiceTest {

    @Test
    void buildsSnapshotWithAlertAndLoginRelationships() {
        DashboardStateService service = new DashboardStateService();

        FraudEventRequest request = new FraudEventRequest();
        request.setDeviceId("D014");
        request.setEmployeeId("E039");

        FraudResponse response = new FraudResponse();
        response.setUserId("C1013");
        response.setTimestamp("2026-04-03T12:00:00");
        response.setCombinedRiskScore(0.742);
        response.setAlertSoc(true);

        service.storeAlert(request, response);

        LoginRequest login = new LoginRequest();
        login.setUserId("C1013");
        login.setTimestamp("2026-04-03T12:05:00");
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

        Map<String, Object> snapshot = service.buildSnapshot();
        assertNotNull(snapshot.get("timeline"));
        assertNotNull(snapshot.get("heatmap"));
        assertNotNull(snapshot.get("graph"));
    }
}
