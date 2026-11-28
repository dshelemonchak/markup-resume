package io.github.dshelemonchak.markupresume.adapters.api.http;

import static org.assertj.core.api.Assertions.assertThat;

import io.github.dshelemonchak.markupresume.adapters.storage.postgres.DatabaseReachability;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.assertj.MockMvcTester;

@WebMvcTest(AssetController.class)
class AssetControllerTest {

    private static final Path FONTS = Path.of("../packages/styles/fonts/inter");
    private static final Path ICONS = Path.of("../packages/styles/icons");

    @Autowired
    MockMvcTester mvc;

    @MockitoBean
    DatabaseReachability database;

    @Test
    void servesAnIcon() throws Exception {
        assertThat(mvc.get().uri("/api/v1/icons/email.svg"))
                .hasStatus(HttpStatus.OK)
                .hasContentType(MediaType.valueOf("image/svg+xml"))
                .hasHeader("Content-Security-Policy", "sandbox")
                .hasHeader("Cache-Control", "no-cache")
                .body()
                .isEqualTo(Files.readAllBytes(ICONS.resolve("email.svg")));
    }

    @Test
    void servesAFont() throws Exception {
        assertThat(mvc.get().uri("/api/v1/fonts/inter-latin-400-normal.woff2"))
                .hasStatus(HttpStatus.OK)
                .hasContentType(MediaType.valueOf("font/woff2"))
                .body()
                .isEqualTo(Files.readAllBytes(FONTS.resolve("inter-latin-400-normal.woff2")));
    }

    @Test
    void refusesAFileThatIsNotAFontOrAnIcon() {
        assertThat(mvc.get().uri("/api/v1/icons/BOOTSTRAP-ICONS-LICENSE.txt"))
                .hasStatus(HttpStatus.NOT_FOUND)
                .bodyJson()
                .isEqualTo("{\"error\":\"not-found\"}");
    }

    @Test
    void refusesANameThatClimbsOutOfTheFolder() {
        assertThat(mvc.get().uri("/api/v1/icons/..%2Femail.svg"))
                .hasStatus(HttpStatus.NOT_FOUND)
                .bodyJson()
                .isEqualTo("{\"error\":\"not-found\"}");
    }

    @Test
    void answersNotFoundForAFileThatIsNotThere() {
        assertThat(mvc.get().uri("/api/v1/icons/missing.svg"))
                .hasStatus(HttpStatus.NOT_FOUND)
                .bodyJson()
                .isEqualTo("{\"error\":\"not-found\"}");
    }
}
