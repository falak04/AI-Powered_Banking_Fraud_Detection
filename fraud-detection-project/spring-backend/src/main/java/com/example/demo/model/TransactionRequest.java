package com.example.demo.model;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.*;

public class TransactionRequest {

    @NotBlank
    @JsonProperty("user_id")
    @JsonAlias("userId")
    private String userId;

    @NotBlank
    private String timestamp;

    @NotNull
    @PositiveOrZero
    private Double amount;

    @NotNull
    @JsonProperty("log_amount")
    @JsonAlias("logAmount")
    private Double logAmount;

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
    @Min(1)
    @Max(12)
    private Integer month;

    @NotNull
    @Min(0)
    @Max(1)
    @JsonProperty("is_weekend")
    @JsonAlias("isWeekend")
    private Integer isWeekend;

    @NotNull
    @Min(0)
    @Max(1)
    @JsonProperty("is_night")
    @JsonAlias("isNight")
    private Integer isNight;

    @NotNull
    @JsonProperty("amount_diff")
    @JsonAlias("amountDiff")
    private Double amountDiff;

    @NotNull
    @PositiveOrZero
    @JsonProperty("time_diff")
    @JsonAlias("timeDiff")
    private Double timeDiff;

    @NotNull
    @PositiveOrZero
    @JsonProperty("amount_velocity")
    @JsonAlias("amountVelocity")
    private Double amountVelocity;

    @NotNull
    @PositiveOrZero
    @JsonProperty("rolling_avg")
    @JsonAlias("rollingAvg")
    private Double rollingAvg;

    @NotNull
    @PositiveOrZero
    @JsonProperty("rolling_std")
    @JsonAlias("rollingStd")
    private Double rollingStd;

    @NotNull
    private Double deviation;

    @NotNull
    @JsonProperty("z_score")
    @JsonAlias("zScore")
    private Double zScore;

    @NotNull
    @PositiveOrZero
    @JsonProperty("user_txn_count")
    @JsonAlias("userTxnCount")
    private Integer userTxnCount;

    // Getters & Setters
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

    public Double getAmount() {
        return amount;
    }

    public void setAmount(Double amount) {
        this.amount = amount;
    }

    public Double getLogAmount() {
        return logAmount;
    }

    public void setLogAmount(Double logAmount) {
        this.logAmount = logAmount;
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

    public Integer getMonth() {
        return month;
    }

    public void setMonth(Integer month) {
        this.month = month;
    }

    public Integer getIsWeekend() {
        return isWeekend;
    }

    public void setIsWeekend(Integer isWeekend) {
        this.isWeekend = isWeekend;
    }

    public Integer getIsNight() {
        return isNight;
    }

    public void setIsNight(Integer isNight) {
        this.isNight = isNight;
    }

    public Double getAmountDiff() {
        return amountDiff;
    }

    public void setAmountDiff(Double amountDiff) {
        this.amountDiff = amountDiff;
    }

    public Double getTimeDiff() {
        return timeDiff;
    }

    public void setTimeDiff(Double timeDiff) {
        this.timeDiff = timeDiff;
    }

    public Double getAmountVelocity() {
        return amountVelocity;
    }

    public void setAmountVelocity(Double v) {
        this.amountVelocity = v;
    }

    public Double getRollingAvg() {
        return rollingAvg;
    }

    public void setRollingAvg(Double rollingAvg) {
        this.rollingAvg = rollingAvg;
    }

    public Double getRollingStd() {
        return rollingStd;
    }

    public void setRollingStd(Double rollingStd) {
        this.rollingStd = rollingStd;
    }

    public Double getDeviation() {
        return deviation;
    }

    public void setDeviation(Double deviation) {
        this.deviation = deviation;
    }

    public Double getZScore() {
        return zScore;
    }

    public void setZScore(Double zScore) {
        this.zScore = zScore;
    }

    public Integer getUserTxnCount() {
        return userTxnCount;
    }

    public void setUserTxnCount(Integer c) {
        this.userTxnCount = c;
    }
}
