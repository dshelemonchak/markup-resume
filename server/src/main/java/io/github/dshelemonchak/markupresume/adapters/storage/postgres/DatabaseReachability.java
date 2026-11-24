package io.github.dshelemonchak.markupresume.adapters.storage.postgres;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/** Whether Postgres answers a trivial query. */
@Component
public class DatabaseReachability {

    private final JdbcTemplate jdbc;

    DatabaseReachability(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public boolean isReachable() {
        try {
            jdbc.queryForObject("select 1", Integer.class);
            return true;
        } catch (RuntimeException e) {
            return false;
        }
    }
}
