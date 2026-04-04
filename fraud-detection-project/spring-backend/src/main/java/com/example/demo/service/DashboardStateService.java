package com.example.demo.service;

import com.example.demo.model.FraudEventRequest;
import com.example.demo.model.FraudResponse;
import com.example.demo.model.LoginRequest;
import org.springframework.stereotype.Service;

import java.time.*;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.*;
import java.util.concurrent.ConcurrentLinkedDeque;
import java.util.stream.Collectors;

@Service
public class DashboardStateService {

    private static final int MAX_ALERTS = 200;
    private static final int MAX_LOGINS = 500;
    private static final ZoneId ZONE = ZoneId.systemDefault();

    private final Deque<StoredAlertEvent> alertStore = new ConcurrentLinkedDeque<>();
    private final Deque<StoredLoginEvent> loginStore = new ConcurrentLinkedDeque<>();

    public void storeAlert(FraudEventRequest request, FraudResponse response) {
        if (response == null) {
            return;
        }
        if (response.getTimestamp() == null || response.getTimestamp().isBlank()) {
            response.setTimestamp(Instant.now().toString());
        }
        String deviceId = request != null ? request.getDeviceId() : null;
        if ((deviceId == null || deviceId.isBlank()) && request != null && request.getLogin() != null && request.getLogin().getDeviceCode() != null) {
            deviceId = "D" + String.format("%03d", request.getLogin().getDeviceCode());
        }
        alertStore.addFirst(new StoredAlertEvent(
                response,
                deviceId,
                request != null ? request.getEmployeeId() : null
        ));
        trim(alertStore, MAX_ALERTS);
    }

    public void storeLogin(LoginRequest request, Map<String, Object> result) {
        if (request == null) {
            return;
        }
        StoredLoginEvent event = new StoredLoginEvent(
                request.getUserId(),
                parseTimestamp(request.getTimestamp()),
                request.getDeviceCode() != null ? "D" + String.format("%03d", request.getDeviceCode()) : "D000",
                request.getDeviceCode(),
                numberValue(result != null ? result.get("anomaly_score") : null),
                booleanValue(result != null ? result.get("is_anomaly") : null)
        );
        loginStore.addFirst(event);
        trim(loginStore, MAX_LOGINS);
    }

    public Map<String, Object> buildSnapshot() {
        List<StoredAlertEvent> alertEvents = new ArrayList<>(alertStore);
        List<StoredLoginEvent> logins = new ArrayList<>(loginStore);
        List<FraudResponse> alerts = alertEvents.stream().map(event -> event.response).collect(Collectors.toList());

        Map<String, Object> graph = buildGraph(alertEvents, logins);

        return new LinkedHashMap<>() {{
            put("source", "stored_session_events");
            put("generated_at", Instant.now().toString());
            put("summary", Map.of(
                    "alerts_stored", alertEvents.size(),
                    "logins_stored", logins.size()
            ));
            put("alerts", alerts.stream().limit(50).collect(Collectors.toList()));
            put("timeline", buildTimeline(alerts));
            put("heatmap", buildHeatmap(logins));
            put("graph", graph);
        }};
    }

    private List<Map<String, Object>> buildTimeline(List<FraudResponse> alerts) {
        ZonedDateTime now = ZonedDateTime.now(ZONE).withMinute(0).withSecond(0).withNano(0);
        LinkedHashMap<ZonedDateTime, HourBucket> buckets = new LinkedHashMap<>();
        for (int i = 23; i >= 0; i--) {
            ZonedDateTime slot = now.minusHours(i);
            buckets.put(slot, new HourBucket(slot));
        }

        for (FraudResponse alert : alerts) {
            Instant instant = parseTimestamp(alert.getTimestamp());
            ZonedDateTime time = instant.atZone(ZONE).withMinute(0).withSecond(0).withNano(0);
            HourBucket bucket = buckets.get(time);
            if (bucket == null) {
                continue;
            }
            bucket.events++;
            if (Boolean.TRUE.equals(alert.getAlertSoc()) || numberValue(alert.getCombinedRiskScore()) >= 0.5) {
                bucket.flagged++;
            }
            bucket.riskTotal += numberValue(alert.getCombinedRiskScore());
        }

        return buckets.values().stream().map(HourBucket::toMap).collect(Collectors.toList());
    }

    private List<Map<String, Object>> buildHeatmap(List<StoredLoginEvent> logins) {
        Map<String, HeatmapCell> cells = new LinkedHashMap<>();
        for (int day = 0; day < 7; day++) {
            for (int hour = 0; hour < 24; hour++) {
                HeatmapCell cell = new HeatmapCell(day, hour);
                cells.put(day + "-" + hour, cell);
            }
        }

        for (StoredLoginEvent event : logins) {
            ZonedDateTime time = event.timestamp.atZone(ZONE);
            HeatmapCell cell = cells.get(time.getDayOfWeek().getValue() % 7 + "-" + time.getHour());
            if (cell == null) {
                continue;
            }
            cell.count++;
            cell.maxAnomaly = Math.max(cell.maxAnomaly, event.anomalyScore);
            if (event.isAnomaly) {
                cell.flagged++;
            }
        }

        return new ArrayList<>(cells.values()).stream().map(HeatmapCell::toMap).collect(Collectors.toList());
    }

    private Map<String, Object> buildGraph(List<StoredAlertEvent> alertEvents, List<StoredLoginEvent> logins) {
        Map<String, CustomerNode> customers = new LinkedHashMap<>();
        Map<String, DeviceNode> devices = new LinkedHashMap<>();
        Map<String, EmployeeNode> employees = new LinkedHashMap<>();
        Map<String, EdgeAgg> edges = new LinkedHashMap<>();

        for (StoredAlertEvent event : alertEvents) {
            FraudResponse alert = event.response;
            if (alert.getUserId() == null || alert.getUserId().isBlank()) {
                continue;
            }
            CustomerNode node = customers.computeIfAbsent(alert.getUserId(), CustomerNode::new);
            node.risk = Math.max(node.risk, Math.max(numberValue(alert.getGraphRiskScore()), numberValue(alert.getCombinedRiskScore())));
            node.eventCount++;
            node.lastSeen = parseTimestamp(alert.getTimestamp());
            if (event.deviceId != null && !event.deviceId.isBlank()) {
                DeviceNode device = devices.computeIfAbsent(event.deviceId, id -> new DeviceNode(id, "device"));
                device.risk = Math.max(device.risk, numberValue(alert.getCombinedRiskScore()));
                device.count++;
                EdgeAgg edge = edges.computeIfAbsent(alert.getUserId() + "->" + event.deviceId,
                        key -> new EdgeAgg(alert.getUserId(), event.deviceId));
                edge.count++;
                edge.risk = Math.max(edge.risk, numberValue(alert.getCombinedRiskScore()));
            }
            if (event.employeeId != null && !event.employeeId.isBlank()) {
                EmployeeNode employee = employees.computeIfAbsent(event.employeeId, EmployeeNode::new);
                employee.risk = Math.max(employee.risk, numberValue(alert.getCombinedRiskScore()));
                employee.count++;
                EdgeAgg edge = edges.computeIfAbsent(alert.getUserId() + "->" + event.employeeId,
                        key -> new EdgeAgg(alert.getUserId(), event.employeeId));
                edge.count++;
                edge.risk = Math.max(edge.risk, numberValue(alert.getCombinedRiskScore()));
            }
        }

        for (StoredLoginEvent login : logins) {
            if (login.userId == null || login.userId.isBlank()) {
                continue;
            }
            CustomerNode customer = customers.computeIfAbsent(login.userId, CustomerNode::new);
            customer.risk = Math.max(customer.risk, login.anomalyScore);
            customer.loginCount++;
            customer.lastSeen = customer.lastSeen == null || login.timestamp.isAfter(customer.lastSeen) ? login.timestamp : customer.lastSeen;

            String deviceId = login.deviceId;
            DeviceNode device = devices.computeIfAbsent(deviceId, id -> new DeviceNode(id, "device"));
            device.risk = Math.max(device.risk, login.anomalyScore);
            device.count++;

            String edgeKey = login.userId + "->" + deviceId;
            EdgeAgg edge = edges.computeIfAbsent(edgeKey, key -> new EdgeAgg(login.userId, deviceId));
            edge.count++;
            edge.risk = Math.max(edge.risk, login.anomalyScore);
        }

        List<CustomerNode> topCustomers = customers.values().stream()
                .sorted(Comparator
                        .comparingDouble(CustomerNode::sortRisk).reversed()
                        .thenComparingInt(CustomerNode::sortVolume).reversed())
                .limit(10)
                .collect(Collectors.toList());

        Set<String> visibleCustomerIds = topCustomers.stream().map(c -> c.id).collect(Collectors.toSet());
        alertEvents.stream()
                .limit(5)
                .map(event -> event.response.getUserId())
                .filter(Objects::nonNull)
                .forEach(visibleCustomerIds::add);

        Set<String> workingRelatedIds = new LinkedHashSet<>(edges.values().stream()
                .filter(edge -> visibleCustomerIds.contains(edge.from))
                .sorted(Comparator.comparingDouble(EdgeAgg::sortWeight).reversed())
                .limit(10)
                .map(edge -> edge.to)
                .collect(Collectors.toCollection(LinkedHashSet::new)));
        alertEvents.stream()
                .limit(8)
                .filter(event -> visibleCustomerIds.contains(event.response.getUserId()))
                .forEach(event -> {
                    if (event.deviceId != null && !event.deviceId.isBlank()) {
                        workingRelatedIds.add(event.deviceId);
                    }
                    if (event.employeeId != null && !event.employeeId.isBlank()) {
                        workingRelatedIds.add(event.employeeId);
                    }
                });
        edges.values().stream()
                .filter(edge -> visibleCustomerIds.contains(edge.from))
                .sorted(Comparator.comparingInt((EdgeAgg edge) -> edge.count).reversed())
                .limit(6)
                .map(edge -> edge.to)
                .forEach(workingRelatedIds::add);

        Set<String> visibleRelatedIds = workingRelatedIds;
        if (visibleRelatedIds.isEmpty()) {
            visibleRelatedIds = devices.values().stream()
                    .sorted(Comparator.comparingDouble(DeviceNode::sortRisk).reversed())
                    .limit(3)
                    .map(device -> device.id)
                    .collect(Collectors.toCollection(LinkedHashSet::new));
            visibleRelatedIds.addAll(employees.values().stream()
                    .sorted(Comparator.comparingDouble(EmployeeNode::sortRisk).reversed())
                    .limit(2)
                    .map(employee -> employee.id)
                    .collect(Collectors.toCollection(LinkedHashSet::new)));
        }
        Set<String> finalVisibleRelatedIds = visibleRelatedIds;
        Set<String> forcedEdgeKeys = alertEvents.stream()
                .limit(8)
                .filter(event -> visibleCustomerIds.contains(event.response.getUserId()))
                .flatMap(event -> {
                    List<String> keys = new ArrayList<>();
                    if (event.deviceId != null && !event.deviceId.isBlank()) {
                        keys.add(event.response.getUserId() + "->" + event.deviceId);
                    }
                    if (event.employeeId != null && !event.employeeId.isBlank()) {
                        keys.add(event.response.getUserId() + "->" + event.employeeId);
                    }
                    return keys.stream();
                })
                .collect(Collectors.toCollection(LinkedHashSet::new));

        List<CustomerNode> visibleCustomers = customers.values().stream()
                .filter(node -> visibleCustomerIds.contains(node.id))
                .sorted(Comparator
                        .comparingDouble(CustomerNode::sortRisk).reversed()
                        .thenComparingInt(CustomerNode::sortVolume).reversed())
                .limit(12)
                .collect(Collectors.toList());

        List<Map<String, Object>> nodeMaps = new ArrayList<>();
        int customerCount = Math.max(visibleCustomers.size(), 1);
        for (int i = 0; i < visibleCustomers.size(); i++) {
            CustomerNode node = visibleCustomers.get(i);
            double angle = (Math.PI * 2 * i) / customerCount;
            nodeMaps.add(Map.of(
                    "id", node.id,
                    "type", "customer",
                    "risk", round(node.risk),
                    "x", (int) Math.round(190 + 120 * Math.cos(angle)),
                    "y", (int) Math.round(230 + 150 * Math.sin(angle))
            ));
        }

        List<String> relatedIds = new ArrayList<>(finalVisibleRelatedIds);
        int relatedCount = Math.max(relatedIds.size(), 1);
        for (int i = 0; i < relatedIds.size(); i++) {
            String id = relatedIds.get(i);
            DeviceNode deviceNode = devices.get(id);
            EmployeeNode employeeNode = employees.get(id);
            String type = employeeNode != null ? "employee" : "device";
            double risk = employeeNode != null ? employeeNode.risk : deviceNode != null ? deviceNode.risk : 0;
            double angle = (Math.PI * 2 * i) / relatedCount;
            nodeMaps.add(Map.of(
                    "id", id,
                    "type", type,
                    "risk", round(risk),
                    "x", (int) Math.round(510 + 95 * Math.cos(angle)),
                    "y", (int) Math.round(230 + 125 * Math.sin(angle))
            ));
        }

        List<Map<String, Object>> edgeMaps = new ArrayList<>();
        edges.values().stream()
                .filter(edge -> forcedEdgeKeys.contains(edge.from + "->" + edge.to))
                .filter(edge -> visibleCustomerIds.contains(edge.from) && finalVisibleRelatedIds.contains(edge.to))
                .forEach(edge -> edgeMaps.add(toEdgeMap(edge)));

        edges.values().stream()
                .filter(edge -> visibleCustomerIds.contains(edge.from) && finalVisibleRelatedIds.contains(edge.to))
                .filter(edge -> !forcedEdgeKeys.contains(edge.from + "->" + edge.to))
                .sorted(Comparator.comparingDouble(EdgeAgg::sortWeight).reversed())
                .limit(14)
                .forEach(edge -> {
                    boolean exists = edgeMaps.stream().anyMatch(existing ->
                            Objects.equals(existing.get("from"), edge.from) &&
                            Objects.equals(existing.get("to"), edge.to));
                    if (!exists) {
                        edgeMaps.add(toEdgeMap(edge));
                    }
                });
        while (edgeMaps.size() > 18) {
            edgeMaps.remove(edgeMaps.size() - 1);
        }

        return Map.of(
                "nodes", nodeMaps,
                "edges", edgeMaps,
                "generated_from", Map.of(
                        "alerts", alertEvents.size(),
                        "logins", logins.size()
                )
        );
    }

    private Instant parseTimestamp(String raw) {
        if (raw == null || raw.isBlank()) {
            return Instant.now();
        }
        try {
            return Instant.parse(raw);
        } catch (DateTimeParseException ignored) {
        }
        try {
            return OffsetDateTime.parse(raw).toInstant();
        } catch (DateTimeParseException ignored) {
        }
        try {
            return LocalDateTime.parse(raw, DateTimeFormatter.ISO_LOCAL_DATE_TIME).atZone(ZONE).toInstant();
        } catch (DateTimeParseException ignored) {
        }
        return Instant.now();
    }

    private double numberValue(Object value) {
        if (value instanceof Number number) {
            return number.doubleValue();
        }
        if (value instanceof String text) {
            try {
                return Double.parseDouble(text);
            } catch (NumberFormatException ignored) {
                return 0;
            }
        }
        return 0;
    }

    private boolean booleanValue(Object value) {
        if (value instanceof Boolean flag) {
            return flag;
        }
        if (value instanceof Number number) {
            return number.intValue() != 0;
        }
        if (value instanceof String text) {
            return Boolean.parseBoolean(text);
        }
        return false;
    }

    private double round(double value) {
        return Math.round(value * 1000.0) / 1000.0;
    }

    private Map<String, Object> toEdgeMap(EdgeAgg edge) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("from", edge.from);
        map.put("to", edge.to);
        map.put("weight", round(Math.min(1.0, 0.25 + edge.count * 0.12 + edge.risk * 0.45)));
        map.put("count", edge.count);
        return map;
    }

    private <T> void trim(Deque<T> deque, int maxSize) {
        while (deque.size() > maxSize) {
            deque.removeLast();
        }
    }

    private static final class StoredLoginEvent {
        private final String userId;
        private final Instant timestamp;
        private final String deviceId;
        private final Integer deviceCode;
        private final double anomalyScore;
        private final boolean isAnomaly;

        private StoredLoginEvent(String userId, Instant timestamp, String deviceId, Integer deviceCode, double anomalyScore, boolean isAnomaly) {
            this.userId = userId;
            this.timestamp = timestamp;
            this.deviceId = deviceId;
            this.deviceCode = deviceCode;
            this.anomalyScore = anomalyScore;
            this.isAnomaly = isAnomaly;
        }
    }

    private static final class StoredAlertEvent {
        private final FraudResponse response;
        private final String deviceId;
        private final String employeeId;

        private StoredAlertEvent(FraudResponse response, String deviceId, String employeeId) {
            this.response = response;
            this.deviceId = deviceId;
            this.employeeId = employeeId;
        }
    }

    private static final class HourBucket {
        private final ZonedDateTime time;
        private int events;
        private int flagged;
        private double riskTotal;

        private HourBucket(ZonedDateTime time) {
            this.time = time;
        }

        private Map<String, Object> toMap() {
            double avgRisk = events == 0 ? 0 : riskTotal / events;
            return Map.of(
                    "hour", time.getHour(),
                    "label", time.format(DateTimeFormatter.ofPattern("HH:00")),
                    "events", events,
                    "fraud", flagged,
                    "risk", Math.round(avgRisk * 1000.0) / 1000.0
            );
        }
    }

    private static final class HeatmapCell {
        private final int day;
        private final int hour;
        private int count;
        private int flagged;
        private double maxAnomaly;

        private HeatmapCell(int day, int hour) {
            this.day = day;
            this.hour = hour;
        }

        private Map<String, Object> toMap() {
            return Map.of(
                    "day", day,
                    "hour", hour,
                    "count", count,
                    "flagged", flagged,
                    "anomaly", Math.round(maxAnomaly * 1000.0) / 1000.0
            );
        }
    }

    private static final class CustomerNode {
        private final String id;
        private double risk;
        private int eventCount;
        private int loginCount;
        private Instant lastSeen;

        private CustomerNode(String id) {
            this.id = id;
        }

        private double sortRisk() {
            return risk;
        }

        private int sortVolume() {
            return eventCount + loginCount;
        }
    }

    private static final class DeviceNode {
        private final String id;
        private final String type;
        private double risk;
        private int count;

        private DeviceNode(String id, String type) {
            this.id = id;
            this.type = type;
        }

        private double sortRisk() {
            return risk;
        }
    }

    private static final class EmployeeNode {
        private final String id;
        private double risk;
        private int count;

        private EmployeeNode(String id) {
            this.id = id;
        }

        private double sortRisk() {
            return risk;
        }
    }

    private static final class EdgeAgg {
        private final String from;
        private final String to;
        private int count;
        private double risk;

        private EdgeAgg(String from, String to) {
            this.from = from;
            this.to = to;
        }

        private double sortWeight() {
            return count + risk;
        }
    }
}
