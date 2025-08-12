#!/bin/bash

# Minecraft Server Management Script

set -e

# Load environment variables
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
else
    echo "Error: .env file not found"
    exit 1
fi

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if containers are running
check_running() {
    if docker-compose ps minecraft | grep -q "Up"; then
        return 0
    else
        return 1
    fi
}

# Function to create world directory if it doesn't exist
create_world_dir() {
    if [ ! -d "./worlds/${WORLD_NAME}" ]; then
        print_status "Creating new world directory: ./worlds/${WORLD_NAME}"
        mkdir -p "./worlds/${WORLD_NAME}"
    else
        print_status "Using existing world: ./worlds/${WORLD_NAME}"
    fi
}

# Function to create necessary directories
create_directories() {
    print_status "Setting up directories..."
    
    # Create base directories
    mkdir -p "./worlds"
    mkdir -p "./backups/${WORLD_NAME}"
    mkdir -p "./server-data"
    mkdir -p "./plugins"
    mkdir -p "./scripts"
    
    # Check if world exists and create if needed
    create_world_dir
    
    # Make backup script executable
    if [ -f "./scripts/backup.sh" ]; then
        chmod +x "./scripts/backup.sh"
    fi
}

# Function to start the server
start_server() {
    if check_running; then
        print_warning "Minecraft server is already running"
        return 0
    fi
    
    print_status "Starting Minecraft server..."
    print_status "World: ${WORLD_NAME}"
    
    create_directories
    
    # Check if this is an existing world
    if [ -f "./worlds/${WORLD_NAME}/level.dat" ]; then
        print_status "Loading existing world with saved progress"
    else
        print_status "Creating new world (first run)"
    fi
    
    # Start the services
    docker-compose up -d
    
    # Wait a moment for containers to start
    sleep 5
    
    if check_running; then
        print_status "Minecraft server started successfully!"
        print_status "Server will be available on port 25565"
        print_status "RCON available on port 25575"
        print_status "Automatic backups scheduled every 48 hours"
        
        # Show logs for a few seconds
        print_status "Showing server startup logs (Ctrl+C to stop viewing):"
        docker-compose logs -f minecraft
    else
        print_error "Failed to start Minecraft server"
        docker-compose logs minecraft
        exit 1
    fi
}

# Function to stop the server
stop_server() {
    if ! check_running; then
        print_warning "Minecraft server is not running"
        return 0
    fi
    
    print_status "Stopping Minecraft server..."
    
    # Send stop command to minecraft server gracefully
    print_status "Sending stop command to server..."
    docker-compose exec -T minecraft rcon-cli stop || true
    
    # Wait a moment for graceful shutdown
    sleep 10
    
    # Create backup before stopping
    print_status "Creating backup before shutdown..."
    docker-compose exec -T backup /scripts/backup.sh
    
    # Stop containers
    docker-compose down
    
    print_status "Minecraft server stopped and backup created"
}

# Function to restart the server
restart_server() {
    print_status "Restarting Minecraft server..."
    stop_server
    sleep 2
    start_server
}

# Function to show server status
show_status() {
    echo -e "${BLUE}=== Minecraft Server Status ===${NC}"
    echo "World: ${WORLD_NAME}"
    echo
    
    if check_running; then
        print_status "Server is running"
        echo
        docker-compose ps
        echo
        print_status "Recent logs:"
        docker-compose logs --tail=20 minecraft
    else
        print_warning "Server is not running"
    fi
}

# Function to create manual backup
create_backup() {
    if ! check_running; then
        print_error "Server must be running to create a backup"
        exit 1
    fi
    
    print_status "Creating manual backup..."
    docker-compose exec -T backup /scripts/backup.sh
    print_status "Manual backup completed"
}

# Function to show help
show_help() {
    echo -e "${BLUE}Minecraft Server Management Script${NC}"
    echo
    echo "Usage: $0 [COMMAND]"
    echo
    echo "Commands:"
    echo "  start     Start the Minecraft server"
    echo "  stop      Stop the server and create backup"
    echo "  restart   Restart the server"
    echo "  status    Show server status"
    echo "  backup    Create manual backup"
    echo "  logs      Show server logs"
    echo "  help      Show this help message"
    echo
    echo "World: ${WORLD_NAME:-Not set}"
}

# Function to show logs
show_logs() {
    if ! check_running; then
        print_error "Server is not running"
        exit 1
    fi
    
    docker-compose logs -f minecraft
}

# Main script logic
case "${1:-}" in
    start)
        start_server
        ;;
    stop)
        stop_server
        ;;
    restart)
        restart_server
        ;;
    status)
        show_status
        ;;
    backup)
        create_backup
        ;;
    logs)
        show_logs
        ;;
    help|--help|-h)
        show_help
        ;;
    "")
        show_help
        ;;
    *)
        print_error "Unknown command: $1"
        echo
        show_help
        exit 1
        ;;
esac