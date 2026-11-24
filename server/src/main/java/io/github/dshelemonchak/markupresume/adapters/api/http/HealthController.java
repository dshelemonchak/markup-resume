package io.github.dshelemonchak.markupresume.adapters.api.http;

import java.util.Map;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** For the container healthcheck and the deploy, with no session: the same answer as the Node app's /api/health. */
@RestController
class HealthController {

    private final Readiness readiness;

    HealthController(Readiness readiness) {
        this.readiness = readiness;
    }

    @GetMapping("/api/health")
    ResponseEntity<Map<String, String>> health() {
        boolean ready = readiness.isReady();
        return ResponseEntity.status(ready ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE)
                .cacheControl(CacheControl.noStore())
                .body(Map.of("status", ready ? "ok" : "unavailable"));
    }
}
