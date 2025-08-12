# Optional custom Dockerfile if you need additional customizations
# The docker-compose.yml uses the official itzg/minecraft-server image by default
# Use this Dockerfile only if you need custom modifications

FROM itzg/minecraft-server:latest

# Install additional tools if needed
RUN apt-get update && \
    apt-get install -y \
    curl \
    wget \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# Copy any custom plugins or configurations
# COPY plugins/ /plugins/
# COPY server.properties /tmp/server.properties

# Set custom environment variables if needed
ENV MEMORY=2G
ENV TYPE=VANILLA

# Expose the default Minecraft port
EXPOSE 25565

# The base image handles the rest