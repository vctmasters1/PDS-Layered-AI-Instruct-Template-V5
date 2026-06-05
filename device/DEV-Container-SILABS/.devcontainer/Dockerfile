FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

# Install build tools and dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    ninja-build \
    git \
    curl \
    wget \
    python3 \
    python3-pip \
    bash \
    && rm -rf /var/lib/apt/lists/*

# Create Silicon Labs tools directory
RUN mkdir -p /opt/silabs

# Set up workspace directory
WORKDIR /workspaces

RUN ln -sf /workspaces/common /workspaces/common || true

# Configure git
RUN git config --global --add safe.directory '*'

ENV SHELL=/bin/bash
