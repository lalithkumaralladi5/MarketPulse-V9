#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
mkdir -p backend/classes
javac --release 21 -d backend/classes backend/MarketPulseServer.java backend/UpstoxAdapter.java backend/PulseCopilot.java backend/MarketUniverse.java
java -cp backend/classes MarketPulseServer
