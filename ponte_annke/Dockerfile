ARG BUILD_FROM
ARG GO2RTC_IMAGE=alexxit/go2rtc:1.9.14

# go2rtc preso dall'immagine Docker ufficiale (multi-architettura),
# cosi non serve scaricare file da GitHub durante la costruzione
FROM ${GO2RTC_IMAGE} AS go2rtc

FROM ${BUILD_FROM}

# Node.js 22 (WebSocket integrato) per il ponte
RUN apk add --no-cache nodejs jq \
 && node --version

COPY --from=go2rtc /usr/local/bin/go2rtc /usr/local/bin/go2rtc
COPY rootfs /
RUN chmod +x /run.sh /usr/local/bin/go2rtc

CMD [ "/run.sh" ]
