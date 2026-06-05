FROM espressif/idf:v5.4.1

# Install additional dev tools
RUN apt-get update && apt-get install -y \
    clangd \
    clang-format \
    clang-tools \
    bear \
    ninja-build \
    && rm -rf /var/lib/apt/lists/*

# Set up workspace directory
WORKDIR /workspaces

# Configure git (required for ESP-IDF)
RUN git config --global --add safe.directory '*'

# Set default shell
ENV SHELL /bin/bash
