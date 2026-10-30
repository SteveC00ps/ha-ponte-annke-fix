ARG BUILD_FROM
FROM ${BUILD_FROM}

ARG BUILD_ARCH
ARG GO2RTC_VERSION

# Node.js 22 (WebSocket integrato) per il ponte; go2rtc ripubblica il video in RTSP
RUN apk add --no-cache nodejs jq \
 && case "${BUILD_ARCH}" in \
      aarch64) G2=go2rtc_linux_arm64 ;; \
      amd64)   G2=go2rtc_linux_amd64 ;; \
      *) echo "Architettura non supportata: ${BUILD_ARCH}"; exit 1 ;; \
    esac \
 && curl -fsSL -o /usr/local/bin/go2rtc "https://github.com/AlexxIT/go2rtc/releases/download/${GO2RTC_VERSION}/${G2}" \
 && chmod +x /usr/local/bin/go2rtc \
 && node --version

COPY rootfs /
RUN chmod +x /run.sh

CMD [ "/run.sh" ]
