package io.github.dshelemonchak.markupresume;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static com.tngtech.archunit.library.dependencies.SlicesRuleDefinition.slices;

import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;

/** The layer rules that ESLint boundaries enforce in packages/app. */
@AnalyzeClasses(packages = ArchitectureTest.BASE, importOptions = ImportOption.DoNotIncludeTests.class)
class ArchitectureTest {

    static final String BASE = "io.github.dshelemonchak.markupresume";

    @ArchTest
    static final ArchRule domainDependsOnJdkOnly = classes()
            .that()
            .resideInAPackage(BASE + ".domain..")
            .should()
            .onlyDependOnClassesThat()
            .resideInAnyPackage(BASE + ".domain..", "java..")
            .allowEmptyShould(true);

    @ArchTest
    static final ArchRule appDependsOnDomainOnly = classes()
            .that()
            .resideInAPackage(BASE + ".app..")
            .should()
            .onlyDependOnClassesThat()
            .resideInAnyPackage(BASE + ".app..", BASE + ".domain..", "java..")
            .allowEmptyShould(true);

    /** An adapter is adapters.<role>.<technology>, e.g. adapters.storage.postgres. */
    @ArchTest
    static final ArchRule adaptersDoNotUseEachOther =
            slices().matching(BASE + ".adapters.(*).(*)..").should().notDependOnEachOther();

    @ArchTest
    static final ArchRule adaptersDoNotUseTheCompositionRoot = noClasses()
            .that()
            .resideInAPackage(BASE + ".adapters..")
            .should()
            .dependOnClassesThat()
            .resideInAPackage(BASE);
}
