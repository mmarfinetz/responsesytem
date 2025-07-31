#!/bin/bash
# Database Backup Script for Plumbing AI Platform
# This script creates encrypted backups of PostgreSQL database

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="/var/log/plumbing-ai/backup.log"
BACKUP_DIR="/opt/plumbing-ai/backups"
S3_BUCKET="${BACKUP_S3_BUCKET:-plumbing-ai-backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
ENVIRONMENT="${ENVIRONMENT:-production}"

# Database connection parameters
DB_HOST="${DB_HOST:-postgres-service}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-plumbing_ai}"
DB_USER="${DB_USER:-plumbing_user}"
DB_PASSWORD="${DB_PASSWORD}"

# Encryption settings
GPG_RECIPIENT="${BACKUP_GPG_RECIPIENT:-backup@plumbing-ai.com}"
ENCRYPT_BACKUP="${ENCRYPT_BACKUP:-true}"

# Slack notification settings
SLACK_WEBHOOK_URL="${SLACK_WEBHOOK_URL:-}"
NOTIFICATION_ENABLED="${NOTIFICATION_ENABLED:-true}"

# Function to log messages
log() {
    local level="$1"
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] [$level] $message" | tee -a "$LOG_FILE"
}

# Function to send Slack notification
send_notification() {
    local status="$1"
    local message="$2"
    
    if [[ "$NOTIFICATION_ENABLED" == "true" && -n "$SLACK_WEBHOOK_URL" ]]; then
        local color="warning"
        case "$status" in
            "success") color="good" ;;
            "error") color="danger" ;;
        esac
        
        curl -X POST -H 'Content-type: application/json' \
            --data "{
                \"attachments\": [{
                    \"color\": \"$color\",
                    \"title\": \"Database Backup - $ENVIRONMENT\",
                    \"text\": \"$message\",
                    \"ts\": $(date +%s)
                }]
            }" \
            "$SLACK_WEBHOOK_URL" || log "WARN" "Failed to send Slack notification"
    fi
}

# Function to test database connection
test_db_connection() {
    log "INFO" "Testing database connection..."
    if PGPASSWORD="$DB_PASSWORD" pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME"; then
        log "INFO" "Database connection successful"
        return 0
    else
        log "ERROR" "Database connection failed"
        return 1
    fi
}

# Function to create backup directory
create_backup_dir() {
    local backup_date="$1"
    local backup_path="$BACKUP_DIR/$backup_date"
    
    if [[ ! -d "$backup_path" ]]; then
        mkdir -p "$backup_path"
        log "INFO" "Created backup directory: $backup_path"
    fi
    
    echo "$backup_path"
}

# Function to perform database backup
backup_database() {
    local backup_path="$1"
    local backup_date="$2"
    local backup_file="$backup_path/plumbing_ai_${backup_date}.sql"
    
    log "INFO" "Starting database backup..."
    
    # Create database dump
    if PGPASSWORD="$DB_PASSWORD" pg_dump \
        -h "$DB_HOST" \
        -p "$DB_PORT" \
        -U "$DB_USER" \
        -d "$DB_NAME" \
        --verbose \
        --no-password \
        --format=custom \
        --compress=9 \
        --file="$backup_file"; then
        
        log "INFO" "Database backup completed: $backup_file"
        
        # Get backup file size
        local backup_size=$(du -h "$backup_file" | cut -f1)
        log "INFO" "Backup file size: $backup_size"
        
        return 0
    else
        log "ERROR" "Database backup failed"
        return 1
    fi
}

# Function to backup uploaded files
backup_files() {
    local backup_path="$1"
    local backup_date="$2"
    local files_backup="$backup_path/files_${backup_date}.tar.gz"
    
    log "INFO" "Starting files backup..."
    
    # Define source directories
    local source_dirs=(
        "/app/uploads"
        "/app/data"
        "/etc/plumbing-ai/config"
    )
    
    # Create compressed archive of files
    if tar -czf "$files_backup" -C / $(printf '%s ' "${source_dirs[@]#/}") 2>/dev/null; then
        log "INFO" "Files backup completed: $files_backup"
        
        local backup_size=$(du -h "$files_backup" | cut -f1)
        log "INFO" "Files backup size: $backup_size"
        
        return 0
    else
        log "WARN" "Files backup completed with warnings or some files were not accessible"
        return 0
    fi
}

# Function to encrypt backup files
encrypt_backup() {
    local backup_path="$1"
    
    if [[ "$ENCRYPT_BACKUP" != "true" ]]; then
        log "INFO" "Backup encryption disabled"
        return 0
    fi
    
    log "INFO" "Encrypting backup files..."
    
    for file in "$backup_path"/*.{sql,tar.gz}; do
        if [[ -f "$file" ]]; then
            local encrypted_file="${file}.gpg"
            
            if gpg --trust-model always --encrypt -r "$GPG_RECIPIENT" --output "$encrypted_file" "$file"; then
                log "INFO" "Encrypted: $(basename "$file")"
                # Remove unencrypted file
                rm "$file"
            else
                log "ERROR" "Failed to encrypt: $(basename "$file")"
                return 1
            fi
        fi
    done
    
    log "INFO" "Backup encryption completed"
    return 0
}

# Function to upload backup to S3
upload_to_s3() {
    local backup_path="$1"
    local backup_date="$2"
    
    log "INFO" "Uploading backup to S3..."
    
    # Upload all files in backup directory
    if aws s3 sync "$backup_path" "s3://$S3_BUCKET/$ENVIRONMENT/$backup_date/" \
        --storage-class STANDARD_IA \
        --metadata "environment=$ENVIRONMENT,backup-date=$backup_date"; then
        
        log "INFO" "Backup uploaded to S3: s3://$S3_BUCKET/$ENVIRONMENT/$backup_date/"
        return 0
    else
        log "ERROR" "Failed to upload backup to S3"
        return 1
    fi
}

# Function to verify backup integrity
verify_backup() {
    local backup_path="$1"
    
    log "INFO" "Verifying backup integrity..."
    
    # Check if backup files exist and are not empty
    local backup_verified=true
    
    for file in "$backup_path"/*; do
        if [[ -f "$file" ]]; then
            if [[ ! -s "$file" ]]; then
                log "ERROR" "Backup file is empty: $(basename "$file")"
                backup_verified=false
            else
                log "INFO" "Backup file verified: $(basename "$file")"
            fi
        fi
    done
    
    if [[ "$backup_verified" == "true" ]]; then
        log "INFO" "Backup integrity verification passed"
        return 0
    else
        log "ERROR" "Backup integrity verification failed"
        return 1
    fi
}

# Function to clean up old backups
cleanup_old_backups() {
    log "INFO" "Cleaning up old backups (retention: $RETENTION_DAYS days)..."
    
    # Clean up local backups
    find "$BACKUP_DIR" -type d -name "20*" -mtime +"$RETENTION_DAYS" -exec rm -rf {} + || true
    
    # Clean up S3 backups
    local cutoff_date=$(date -d "$RETENTION_DAYS days ago" '+%Y-%m-%d')
    aws s3 ls "s3://$S3_BUCKET/$ENVIRONMENT/" | while read -r line; do
        local backup_date=$(echo "$line" | awk '{print $2}' | tr -d '/')
        if [[ "$backup_date" < "$cutoff_date" ]]; then
            log "INFO" "Removing old S3 backup: $backup_date"
            aws s3 rm "s3://$S3_BUCKET/$ENVIRONMENT/$backup_date/" --recursive || true
        fi
    done
    
    log "INFO" "Old backup cleanup completed"
}

# Function to create backup manifest
create_manifest() {
    local backup_path="$1"
    local backup_date="$2"
    local manifest_file="$backup_path/backup-manifest.json"
    
    log "INFO" "Creating backup manifest..."
    
    cat > "$manifest_file" << EOF
{
    "backup_date": "$backup_date",
    "environment": "$ENVIRONMENT",
    "database": {
        "host": "$DB_HOST",
        "name": "$DB_NAME",
        "user": "$DB_USER"
    },
    "files": [
$(find "$backup_path" -type f -name "*" -not -name "backup-manifest.json" | while read -r file; do
    local filename=$(basename "$file")
    local filesize=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null || echo "0")
    local checksum=$(sha256sum "$file" | cut -d' ' -f1)
    echo "        {\"name\": \"$filename\", \"size\": $filesize, \"checksum\": \"$checksum\"},"
done | sed '$ s/,$//')
    ],
    "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "created_by": "$(whoami)@$(hostname)"
}
EOF
    
    log "INFO" "Backup manifest created: $manifest_file"
}

# Main backup function
main() {
    local backup_date=$(date '+%Y-%m-%d_%H-%M-%S')
    local start_time=$(date +%s)
    
    log "INFO" "Starting backup process for environment: $ENVIRONMENT"
    log "INFO" "Backup date: $backup_date"
    
    # Ensure backup directory exists
    mkdir -p "$BACKUP_DIR"
    mkdir -p "$(dirname "$LOG_FILE")"
    
    # Test database connection
    if ! test_db_connection; then
        send_notification "error" "Database backup failed: Cannot connect to database"
        exit 1
    fi
    
    # Create backup directory
    local backup_path
    backup_path=$(create_backup_dir "$backup_date")
    
    # Perform database backup
    if ! backup_database "$backup_path" "$backup_date"; then
        send_notification "error" "Database backup failed: pg_dump error"
        exit 1
    fi
    
    # Backup files
    if ! backup_files "$backup_path" "$backup_date"; then
        log "WARN" "Files backup completed with warnings"
    fi
    
    # Create backup manifest
    create_manifest "$backup_path" "$backup_date"
    
    # Encrypt backups if enabled
    if ! encrypt_backup "$backup_path"; then
        send_notification "error" "Database backup failed: Encryption error"
        exit 1
    fi
    
    # Verify backup integrity
    if ! verify_backup "$backup_path"; then
        send_notification "error" "Database backup failed: Integrity verification failed"
        exit 1
    fi
    
    # Upload to S3
    if ! upload_to_s3 "$backup_path" "$backup_date"; then
        send_notification "error" "Database backup failed: S3 upload error"
        exit 1
    fi
    
    # Clean up old backups
    cleanup_old_backups
    
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    log "INFO" "Backup process completed successfully in ${duration}s"
    send_notification "success" "Database backup completed successfully. Duration: ${duration}s"
}

# Script execution
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi