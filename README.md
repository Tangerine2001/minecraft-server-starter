# Minecraft Server Docker Setup

This setup provides a complete Dockerized Minecraft server with automatic backups and easy management.

## Features

- Docker Compose setup with official Minecraft server image
- Automatic loading of existing worlds or creation of new ones
- Automatic backups every 48 hours
- Backup on server shutdown
- Environment-based configuration
- Easy start/stop management script
- World persistence in `./worlds/[WORLD_NAME]`
- RCON support for server management

## Quick Start

1. **Setup files**: Make sure all files are in place and make the management script executable:
   ```bash
   chmod +x minecraft.sh
   chmod +x scripts/backup.sh
   ```

2. **Configure your server**: Edit the `.env` file to customize your server settings, especially:
   - `WORLD_NAME`: Name of your world (creates `./worlds/[WORLD_NAME]`)
   - `WHITELIST`: Comma-separated list of allowed players
   - `OPS`: Comma-separated list of server operators
   - `RCON_PASSWORD`: Set a secure password for RCON access

3. **Start the server**:
   ```bash
   ./minecraft.sh start
   ```
   
   The server will automatically:
   - Load an existing world if `./worlds/[WORLD_NAME]/level.dat` exists
   - Create a new world if no existing world is found

4. **Stop the server** (creates automatic backup):
   ```bash
   ./minecraft.sh stop
   ```

## Management Commands

```bash
./minecraft.sh start     # Start the server
./minecraft.sh stop      # Stop server and create backup
./minecraft.sh restart   # Restart the server
./minecraft.sh status    # Show server status
./minecraft.sh backup    # Create manual backup
./minecraft.sh logs      # View server logs
./minecraft.sh help      # Show help
```

## Directory Structure

```
.
├── docker-compose.yml          # Docker Compose configuration
├── .env                        # Environment variables
├── minecraft.sh                # Management script
├── Dockerfile                  # Optional custom Dockerfile
├── worlds/
│   └── [WORLD_NAME]/          # Your world data
├── backups/
│   └── [WORLD_NAME]/          # Automatic backups
├── server-data/               # Server configuration and data
├── plugins/                   # Server plugins (if using modded versions)
└── scripts/
    └── backup.sh              # Backup script
```

## Backup System

- **Automatic backups**: Every 48 hours while running
- **Shutdown backups**: Created every time you stop the server
- **Manual backups**: Use `./minecraft.sh backup`
- **Backup location**: `./backups/[WORLD_NAME]/[WORLD_NAME]_[DATE].tar.gz`
- **Cleanup**: Automatically keeps only the last 10 backups

## Configuration

### Environment Variables (.env)

| Variable | Description | Default |
|----------|-------------|---------|
| `WORLD_NAME` | Name of the world to load | HelloWorld |
| `WHITELIST` | Comma-separated list of allowed players | - |
| `OPS` | Comma-separated list of server operators | - |
| `RCON_PASSWORD` | Password for RCON access | - |
| `DIFFICULTY` | Game difficulty (peaceful/easy/normal/hard) | normal |
| `GAMEMODE` | Default game mode (survival/creative/adventure) | survival |
| `MAX_PLAYERS` | Maximum number of players | 20 |

### Server Access

- **Game Port**: 25565 (default Minecraft port)
- **RCON Port**: 25575 (for remote administration)

## Troubleshooting

1. **Server won't start**: Check logs with `./minecraft.sh logs`
2. **Permission issues**: Ensure scripts are executable: `chmod +x minecraft.sh scripts/backup.sh`
3. **Backup fails**: Check that the `./backups/[WORLD_NAME]` directory exists and is writable
4. **World not loading**: Verify `WORLD_NAME` in `.env` matches your world directory

## Advanced Usage

### Custom Server Properties
Additional server properties can be added to the `.env` file. The Docker image supports many Minecraft server properties as environment variables.

### Using Custom Dockerfile
If you need custom modifications, uncomment the Dockerfile build in `docker-compose.yml` and modify the Dockerfile as needed.

### RCON Commands
You can send commands to the running server using RCON:
```bash
docker-compose exec minecraft rcon-cli "say Hello players!"
```

## Security Notes

- Change the `RCON_PASSWORD` in `.env` to a secure password
- Consider setting `ONLINE_MODE=true` for authentication
- Review the whitelist and ops settings in `.env`
- Keep your Docker images updated regularly