FROM maven AS maven

WORKDIR /container/funixbot/

COPY pom.xml .

COPY core/pom.xml ./core/
COPY core/src ./core/src

COPY funixbot-discord/pom.xml ./funixbot-discord/
COPY funixbot-discord/src ./funixbot-discord/src

COPY funixbot-twitch/pom.xml ./funixbot-twitch/
COPY funixbot-twitch/src ./funixbot-twitch/src

RUN mvn clean package -B -Dmaven.javadoc.skip -Dgpg.skip -T 10
RUN rm funixbot-discord/target/funix-bot-discord-*-sources.jar
RUN rm funixbot-twitch/target/funix-bot-twitch-*-sources.jar

FROM amazoncorretto:21-alpine AS run

USER container
ENV USER=container HOME=/home/container
WORKDIR /home/container

COPY --from=maven /container/funixbot/funixbot-discord/target/funix-bot-discord-*.jar /home/java/funixbot.jar

CMD ["/bin/sh", "-c", "java -jar -Xms150M -XX:MaxRAMPercentage=95.0 /home/java/funixbot.jar"]
