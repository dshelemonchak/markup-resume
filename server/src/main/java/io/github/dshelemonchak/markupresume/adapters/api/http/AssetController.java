package io.github.dshelemonchak.markupresume.adapters.api.http;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.NoSuchFileException;
import java.nio.file.Path;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

/**
 * The style library's fonts and icons, which template styles load by URL (ADR-0007). They are the same for everyone
 * and load into documents, so they need no session.
 */
@RestController
class AssetController {

    /** An asset file name: no path of its own, and only the two types template styles load. */
    private static final Pattern ASSET_NAME = Pattern.compile("[\\w-]+\\.(woff2|svg)");

    private static final Map<String, MediaType> ASSET_TYPES =
            Map.of("woff2", MediaType.parseMediaType("font/woff2"), "svg", MediaType.parseMediaType("image/svg+xml"));

    private final Path fontsDir;
    private final Path iconsDir;

    AssetController(
            @Value("${markup.assets.fonts-dir}") String fontsDir,
            @Value("${markup.assets.icons-dir}") String iconsDir) {
        this.fontsDir = Path.of(fontsDir);
        this.iconsDir = Path.of(iconsDir);
    }

    @GetMapping("/api/v1/fonts/{file}")
    ResponseEntity<Object> font(@PathVariable String file) throws IOException {
        return serveAsset(fontsDir, file);
    }

    @GetMapping("/api/v1/icons/{file}")
    ResponseEntity<Object> icon(@PathVariable String file) throws IOException {
        return serveAsset(iconsDir, file);
    }

    /** A file from an asset folder, or 404 for a name that is not a plain asset file or does not exist. */
    private static ResponseEntity<Object> serveAsset(Path dir, String file) throws IOException {
        Matcher name = ASSET_NAME.matcher(file);
        if (!name.matches()) {
            return notFound();
        }
        byte[] body;
        try {
            body = Files.readAllBytes(dir.resolve(file));
        } catch (NoSuchFileException missing) {
            return notFound();
        }
        return ResponseEntity.ok()
                .contentType(ASSET_TYPES.get(name.group(1)))
                // An SVG opened on its own is a document; it gets no scripts and no access to the app.
                .header("Content-Security-Policy", "sandbox")
                .cacheControl(CacheControl.noCache())
                .body(body);
    }

    private static ResponseEntity<Object> notFound() {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("error", "not-found"));
    }
}
