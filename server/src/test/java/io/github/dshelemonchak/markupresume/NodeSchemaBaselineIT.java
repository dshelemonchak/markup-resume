package io.github.dshelemonchak.markupresume;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.jdbc.core.JdbcTemplate;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

/** A database the Node app already built, as in production: Flyway records V1 as the baseline and runs nothing. */
@SpringBootTest
@Testcontainers
class NodeSchemaBaselineIT {

    @Container
    @ServiceConnection
    static final PostgreSQLContainer postgres =
            new PostgreSQLContainer("postgres:18-alpine").withInitScript("db/migration/V1__node_schema.sql");

    @Autowired
    JdbcTemplate jdbc;

    @Test
    void recordsV1AsTheBaseline() {
        String type = jdbc.queryForObject("select type from flyway_schema_history where version = '1'", String.class);
        assertThat(type).isEqualTo("BASELINE");
        assertThat(jdbc.queryForObject("select count(*) from flyway_schema_history", Integer.class))
                .isEqualTo(1);
    }
}
