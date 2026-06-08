FROM maven:3.8.8-eclipse-temurin-17 AS build
WORKDIR /workspace

# copy maven config first for better caching
COPY pom.xml mvnw ./
COPY src src

RUN mvn -B -DskipTests package

FROM eclipse-temurin:17-jre
WORKDIR /app

# copy the application jar produced by the build stage
COPY --from=build /workspace/target/*.jar app.jar

EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
