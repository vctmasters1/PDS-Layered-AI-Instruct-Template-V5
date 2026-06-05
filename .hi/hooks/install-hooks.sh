#!/bin/bash
# Install Git hooks

git config core.hooksPath .github/.hi/hooks
chmod +x .github/.hi/hooks/*
echo "✓ Git hooks installed"
