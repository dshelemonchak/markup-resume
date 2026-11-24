package io.github.dshelemonchak.markupresume;

import io.github.dshelemonchak.markupresume.adapters.api.http.Readiness;
import io.github.dshelemonchak.markupresume.adapters.storage.postgres.DatabaseReachability;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;

/** The composition root, like main.ts: the only place where adapters meet. */
@SpringBootApplication
public class MarkupResumeApplication {

    public static void main(String[] args) {
        SpringApplication.run(MarkupResumeApplication.class, args);
    }

    @Bean
    Readiness readiness(DatabaseReachability database) {
        return database::isReachable;
    }
}
