package com.example.demo.model;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.*;

/**
 * 14-feature login/behavioral payload for Isolation Forest anomaly detection.
 * React sends this on every login event.
 */
public class LoginRequest {

    @NotBlank
    @JsonProperty("user_id")
    @JsonAlias("userId")
    private String userId;

    @NotBlank
    private String timestamp;

    @NotNull
    @Min(0)
    @Max(23)
    private Integer hour;

    @NotNull
    @Min(0)
    @Max(6)
    @JsonProperty("day_of_week")
    @JsonAlias("dayOfWeek")
    private Integer dayOfWeek;

    @NotNull
    @JsonProperty("hour_deviation")
    @JsonAlias("hourDeviation")
    private Double hourDeviation; // abs(hour - user's usual login hour)

    @NotNull
    @PositiveOrZero
    @JsonProperty("time_diff")
    @JsonAlias("timeDiff")
    private Double timeDiff; // minutes since last login

    @NotNull
    @Min(0)
    @Max(1)
    @JsonProperty("dormant_login")
    @JsonAlias("dormantLogin")
    private Integer dormantLogin; // 1 if >30 days since last login

    @NotNull
    @PositiveOrZero
    @JsonProperty("login_freq_7d")
    @JsonAlias("loginFreq7d")
    private Integer loginFreq7d; // logins in last 7 days

    @NotNull
    @PositiveOrZero
    @JsonProperty("dist_from_home")
    @JsonAlias("distFromHome")
    private Double distFromHome; // km from home city

    @NotNull
    @PositiveOrZero
    private Double distance; // km from last login location

    @NotNull
    @PositiveOrZero
    private Double speed; // km/h implied travel speed

    @NotNull
    @Min(0)
    @Max(1)
    @JsonProperty("impossible_travel")
    @JsonAlias("impossibleTravel")
    private Integer impossibleTravel;

    @NotNull
    @Min(0)
    @Max(1)
    private Integer vpn;

    @NotNull
    @Min(0)
    @Max(1)
    @JsonProperty("is_new_device")
    @JsonAlias("isNewDevice")
    private Integer isNewDevice;

    @NotNull
    @JsonProperty("city_code")
    @JsonAlias("cityCode")
    private Integer cityCode; // label-encoded city

    @NotNull
    @JsonProperty("device_code")
    @JsonAlias("deviceCode")
    private Integer deviceCode; // label-encoded device_id

    // ── Getters & Setters ──────────────────────────────────────────────────

    public String getUserId() {
        return userId;
    }

    public void setUserId(String userId) {
        this.userId = userId;
    }

    public String getTimestamp() {
        return timestamp;
    }

    public void setTimestamp(String timestamp) {
        this.timestamp = timestamp;
    }

    public Integer getHour() {
        return hour;
    }

    public void setHour(Integer hour) {
        this.hour = hour;
    }

    public Integer getDayOfWeek() {
        return dayOfWeek;
    }

    public void setDayOfWeek(Integer dayOfWeek) {
        this.dayOfWeek = dayOfWeek;
    }

    public Double getHourDeviation() {
        return hourDeviation;
    }

    public void setHourDeviation(Double hourDeviation) {
        this.hourDeviation = hourDeviation;
    }

    public Double getTimeDiff() {
        return timeDiff;
    }

    public void setTimeDiff(Double timeDiff) {
        this.timeDiff = timeDiff;
    }

    public Integer getDormantLogin() {
        return dormantLogin;
    }

    public void setDormantLogin(Integer dormantLogin) {
        this.dormantLogin = dormantLogin;
    }

    public Integer getLoginFreq7d() {
        return loginFreq7d;
    }

    public void setLoginFreq7d(Integer loginFreq7d) {
        this.loginFreq7d = loginFreq7d;
    }

    public Double getDistFromHome() {
        return distFromHome;
    }

    public void setDistFromHome(Double distFromHome) {
        this.distFromHome = distFromHome;
    }

    public Double getDistance() {
        return distance;
    }

    public void setDistance(Double distance) {
        this.distance = distance;
    }

    public Double getSpeed() {
        return speed;
    }

    public void setSpeed(Double speed) {
        this.speed = speed;
    }

    public Integer getImpossibleTravel() {
        return impossibleTravel;
    }

    public void setImpossibleTravel(Integer v) {
        this.impossibleTravel = v;
    }

    public Integer getVpn() {
        return vpn;
    }

    public void setVpn(Integer vpn) {
        this.vpn = vpn;
    }

    public Integer getIsNewDevice() {
        return isNewDevice;
    }

    public void setIsNewDevice(Integer isNewDevice) {
        this.isNewDevice = isNewDevice;
    }

    public Integer getCityCode() {
        return cityCode;
    }

    public void setCityCode(Integer cityCode) {
        this.cityCode = cityCode;
    }

    public Integer getDeviceCode() {
        return deviceCode;
    }

    public void setDeviceCode(Integer deviceCode) {
        this.deviceCode = deviceCode;
    }
}
