FROM maven:3.9.6-eclipse-temurin-21 AS build
WORKDIR /workspace

# copy maven config first for better caching
COPY pom.xml mvnw ./
COPY src src

RUN mvn -B -DskipTests package

FROM eclipse-temurin:21-jre
WORKDIR /app

# copy the application jar produced by the build stage
COPY --from=build /workspace/target/*.jar app.jar

EXPOSE 8080
# Default to an in-memory H2 DB so the app starts without external SQL.
# These can be overridden by Render environment variables (SPRING_DATASOURCE_URL, etc.).
ENV SPRING_DATASOURCE_URL=jdbc:h2:mem:testdb;DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=FALSE
ENV SPRING_DATASOURCE_USERNAME=sa
ENV SPRING_DATASOURCE_PASSWORD=
ENV SPRING_DATASOURCE_DRIVER=org.h2.Driver

ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar /app/app.jar"]
