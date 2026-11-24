package io.github.dshelemonchak.markupresume.adapters.api.http;

/** Whether the server can serve requests now, e.g. the database answers. */
@FunctionalInterface
public interface Readiness {
    boolean isReady();
}
