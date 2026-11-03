# PATTERN: Service instance per container + Service template.
# One Dockerfile builds any module:  docker build --build-arg MODULE=order-service -t order-service .
FROM maven:3.9-eclipse-temurin-17 AS build
ARG MODULE
WORKDIR /src
COPY . .
RUN mvn -B -q -pl ${MODULE} -am -DskipTests package

FROM eclipse-temurin:17-jre
ARG MODULE
COPY --from=build /src/${MODULE}/target/${MODULE}-1.0.0.jar /app.jar
ENTRYPOINT ["java", "-jar", "/app.jar"]
