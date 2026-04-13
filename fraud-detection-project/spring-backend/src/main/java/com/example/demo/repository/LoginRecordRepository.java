package com.example.demo.repository;

import com.example.demo.entity.LoginRecord;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface LoginRecordRepository extends JpaRepository<LoginRecord, Long> {
    List<LoginRecord> findAllByOrderByOccurredAtDescIdDesc(Pageable pageable);
}
