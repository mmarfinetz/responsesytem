#!/bin/bash
# Database Restore Script for Plumbing AI Platform
# This script restores encrypted database backups for disaster recovery

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="/var/log/plumbing-ai/restore.log"
RESTORE_DIR="/opt/plumbing-ai/restore"
S3_BUCKET="${BACKUP_S3_BUCKET:-plumbing-ai-backups}"
ENVIRONMENT="${ENVIRONMENT:-production}"

# Database connection parameters
DB_HOST="${DB_HOST:-postgres-service}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-plumbing_ai}"
DB_USER="${DB_USER:-plumbing_user}"
DB_PASSWORD="${DB_PASSWORD}"

# Restore parameters
BACKUP_DATE="${1:-}"
RESTORE_TYPE="${2:-full}"  # full, database-only, files-only
DRY_RUN="${DRY_RUN:-false}"
FORCE_RESTORE="${FORCE_RESTORE:-false}"

# GPG settings
GPG_PRIVATE_KEY_FILE="${GPG_PRIVATE_KEY_FILE:-}"
DECRYPT_BACKUP="${DECRYPT_BACKUP:-true}"

# Slack notification settings
SLACK_WEBHOOK_URL="${SLACK_WEBHOOK_URL:-}"
NOTIFICATION_ENABLED="${NOTIFICATION_ENABLED:-true}"

# Function to display usage
usage() {
    cat << EOF
Usage: $0 <backup_date> [restore_type]

Arguments:
    backup_date     Date of backup to restore (YYYY-MM-DD_HH-MM-SS)
    restore_type    Type of restore: full, database-only, files-only (default: full)

Environment Variables:
    DRY_RUN                Run in dry-run mode (default: false)
    FORCE_RESTORE          Force restore without confirmation (default: false)
    ENVIRONMENT            Environment name (default: production)
    GPG_PRIVATE_KEY_FILE   Path to GPG private key file for decryption

Examples:
    $0 2024-01-15_03-00-00 full
    $0 2024-01-15_03-00-00 database-only
    DRY_RUN=true $0 2024-01-15_03-00-00
EOF
}

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
                    \"title\": \"Database Restore - $ENVIRONMENT\",
                    \"text\": \"$message\",
                    \"ts\": $(date +%s)
                }]
            }" \
            "$SLACK_WEBHOOK_URL" || log "WARN" "Failed to send Slack notification"
    fi
}

# Function to validate inputs
validate_inputs() {
    if [[ -z "$BACKUP_DATE" ]]; then
        log "ERROR" "Backup date is required"
        usage
        exit 1
    fi
    
    if [[ ! "$BACKUP_DATE" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}_[0-9]{2}-[0-9]{2}-[0-9]{2}$ ]]; then
        log "ERROR" "Invalid backup date format. Expected: YYYY-MM-DD_HH-MM-SS"
        exit 1
    fi
    
    case "$RESTORE_TYPE" in
        "full"|"database-only"|"files-only")
            log "INFO" "Restore type: $RESTORE_TYPE"
            ;;
        *)
            log "ERROR" "Invalid restore type: $RESTORE_TYPE"
            usage
            exit 1
            ;;
    esac
}

# Function to import GPG private key
import_gpg_key() {
    if [[ "$DECRYPT_BACKUP" == "true" && -n "$GPG_PRIVATE_KEY_FILE" ]]; then
        if [[ -f "$GPG_PRIVATE_KEY_FILE" ]]; then
            log "INFO" "Importing GPG private key..."
            if gpg --import "$GPG_PRIVATE_KEY_FILE"; then
                log "INFO" "GPG private key imported successfully"
            else
                log "ERROR" "Failed to import GPG private key"
                return 1
            fi
        else
            log "ERROR" "GPG private key file not found: $GPG_PRIVATE_KEY_FILE"
            return 1
        fi
    fi
}

# Function to download backup from S3
download_backup() {
    local backup_date="$1"
    local restore_path="$2"
    
    log "INFO" "Downloading backup from S3..."
    
    local s3_path="s3://$S3_BUCKET/$ENVIRONMENT/$backup_date/"
    
    # Check if backup exists in S3
    if ! aws s3 ls "$s3_path" >/dev/null 2>&1; then
        log "ERROR" "Backup not found in S3: $s3_path"
        return 1
    fi
    
    # Download backup files
    if aws s3 sync "$s3_path" "$restore_path/"; then
        log "INFO" "Backup downloaded from S3: $s3_path"
        return 0
    else
        log "ERROR" "Failed to download backup from S3"
        return 1
    fi
}

# Function to decrypt backup files
decrypt_backup() {
    local restore_path="$1"
    
    if [[ "$DECRYPT_BACKUP" != "true" ]]; then
        log "INFO" "Backup decryption disabled"
        return 0
    fi
    
    log "INFO" "Decrypting backup files..."
    
    for encrypted_file in "$restore_path"/*.gpg; do
        if [[ -f "$encrypted_file" ]]; then
            local decrypted_file="${encrypted_file%.gpg}"
            
            if gpg --decrypt --quiet --output "$decrypted_file" "$encrypted_file"; then
                log "INFO" "Decrypted: $(basename "$encrypted_file")"
                # Remove encrypted file after successful decryption
                rm "$encrypted_file"
            else
                log "ERROR" "Failed to decrypt: $(basename "$encrypted_file")"
                return 1
            fi
        fi
    done
    
    log "INFO" "Backup decryption completed"
    return 0
}

# Function to verify backup manifest
verify_manifest() {
    local restore_path="$1"
    local manifest_file="$restore_path/backup-manifest.json"
    
    if [[ ! -f "$manifest_file" ]]; then
        log "WARN" "Backup manifest not found, skipping verification"
        return 0
    fi
    
    log "INFO" "Verifying backup manifest..."
    
    # Parse manifest and verify checksums
    local verification_failed=false
    
    while IFS= read -r line; do
        local filename=$(echo "$line" | jq -r '.name')
        local expected_checksum=$(echo "$line" | jq -r '.checksum')
        local file_path="$restore_path/$filename"
        
        if [[ -f "$file_path" && "$expected_checksum" != "null" ]]; then
            local actual_checksum=$(sha256sum "$file_path" | cut -d' ' -f1)
            
            if [[ "$actual_checksum" == "$expected_checksum" ]]; then
                log "INFO" "Checksum verified: $filename"
            else
                log "ERROR" "Checksum mismatch for $filename"
                log "ERROR" "Expected: $expected_checksum"
                log "ERROR" "Actual: $actual_checksum"
                verification_failed=true
            fi
        fi
    done < <(jq -c '.files[]' "$manifest_file" 2>/dev/null || true)
    
    if [[ "$verification_failed" == "true" ]]; then
        log "ERROR" "Backup verification failed"
        return 1
    else
        log "INFO" "Backup verification completed successfully"
        return 0
    fi
}

# Function to confirm restore operation
confirm_restore() {
    if [[ "$FORCE_RESTORE" == "true" ]]; then
        log "INFO" "Force restore enabled, skipping confirmation"
        return 0
    fi
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log "INFO" "Dry run mode, skipping confirmation"
        return 0
    fi
    
    echo
    echo "WARNING: This will restore the database from backup dated $BACKUP_DATE"
    echo "Environment: $ENVIRONMENT"
    echo "Restore Type: $RESTORE_TYPE"
    echo "Database: $DB_HOST:$DB_PORT/$DB_NAME"
    echo
    echo "THIS WILL OVERWRITE THE CURRENT DATABASE!"
    echo
    read -p "Are you sure you want to continue? (yes/no): " -r response
    
    case "$response" in
        [yY][eE][sS])
            log "INFO" "Restore confirmed by user"
            return 0
            ;;
        *)
            log "INFO" "Restore cancelled by user"
            exit 0
            ;;
    esac
}

# Function to create database backup before restore
create_pre_restore_backup() {
    log "INFO" "Creating pre-restore backup..."
    
    local pre_restore_date=$(date '+%Y-%m-%d_%H-%M-%S')
    local pre_restore_file="$RESTORE_DIR/pre-restore-backup_${pre_restore_date}.sql"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log "INFO" "[DRY RUN] Would create pre-restore backup: $pre_restore_file"
        return 0
    fi
    
    if PGPASSWORD="$DB_PASSWORD" pg_dump \
        -h "$DB_HOST" \
        -p "$DB_PORT" \
        -U "$DB_USER" \
        -d "$DB_NAME" \
        --verbose \
        --no-password \
        --format=custom \
        --compress=9 \
        --file="$pre_restore_file"; then
        
        log "INFO" "Pre-restore backup created: $pre_restore_file"
        return 0
    else
        log "ERROR" "Failed to create pre-restore backup"
        return 1
    fi
}

# Function to restore database
restore_database() {
    local restore_path="$1"
    local backup_file="$restore_path/plumbing_ai_${BACKUP_DATE}.sql"
    
    if [[ ! -f "$backup_file" ]]; then
        log "ERROR" "Database backup file not found: $backup_file"
        return 1
    fi
    
    log "INFO" "Restoring database from: $backup_file"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log "INFO" "[DRY RUN] Would restore database from: $backup_file"
        return 0
    fi
    
    # Terminate existing connections
    log "INFO" "Terminating existing database connections..."
    PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "
        SELECT pg_terminate_backend(pid) 
        FROM pg_stat_activity 
        WHERE datname = '$DB_NAME' AND pid <> pg_backend_pid();" || true
    
    # Drop and recreate database
    log "INFO" "Dropping and recreating database..."
    PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "
        DROP DATABASE IF EXISTS $DB_NAME;
        CREATE DATABASE $DB_NAME;
    "
    
    # Restore from backup
    if PGPASSWORD="$DB_PASSWORD" pg_restore \
        -h "$DB_HOST" \
        -p "$DB_PORT" \
        -U "$DB_USER" \
        -d "$DB_NAME" \
        --verbose \
        --no-password \
        --clean \
        --if-exists \
        "$backup_file"; then
        
        log "INFO" "Database restore completed successfully"
        return 0
    else
        log "ERROR" "Database restore failed"
        return 1
    fi
}

# Function to restore files
restore_files() {
    local restore_path="$1"
    local files_backup="$restore_path/files_${BACKUP_DATE}.tar.gz"
    
    if [[ ! -f "$files_backup" ]]; then
        log "ERROR" "Files backup not found: $files_backup"
        return 1
    fi
    
    log "INFO" "Restoring files from: $files_backup"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log "INFO" "[DRY RUN] Would restore files from: $files_backup"
        return 0
    fi
    
    # Extract files to root directory
    if tar -xzf "$files_backup" -C /; then
        log "INFO" "Files restore completed successfully"
        return 0
    else
        log "ERROR" "Files restore failed"
        return 1
    fi
}

# Function to verify database after restore
verify_database() {
    log "INFO" "Verifying database after restore..."
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log "INFO" "[DRY RUN] Would verify database connection and basic queries"
        return 0
    fi
    
    # Test database connection
    if ! PGPASSWORD="$DB_PASSWORD" pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME"; then
        log "ERROR" "Database connection test failed after restore"
        return 1
    fi
    
    # Test basic queries
    local table_count
    table_count=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "
        SELECT COUNT(*) FROM information_schema.tables 
        WHERE table_schema = 'public';" | tr -d ' ')
    
    if [[ "$table_count" -gt 0 ]]; then
        log "INFO" "Database verification successful: $table_count tables found"
        return 0
    else
        log "ERROR" "Database verification failed: No tables found"
        return 1
    fi
}

# Main restore function
main() {
    local start_time=$(date +%s)
    
    log "INFO" "Starting restore process for environment: $ENVIRONMENT"
    log "INFO" "Backup date: $BACKUP_DATE"
    log "INFO" "Restore type: $RESTORE_TYPE"
    log "INFO" "Dry run: $DRY_RUN"
    
    # Validate inputs
    validate_inputs
    
    # Ensure restore directory exists
    mkdir -p "$RESTORE_DIR"
    mkdir -p "$(dirname "$LOG_FILE")"
    
    # Create restore directory for this operation
    local restore_path="$RESTORE_DIR/$BACKUP_DATE"
    mkdir -p "$restore_path"
    
    # Import GPG key if needed
    if ! import_gpg_key; then
        send_notification "error" "Restore failed: GPG key import error"
        exit 1
    fi
    
    # Download backup from S3
    if ! download_backup "$BACKUP_DATE" "$restore_path"; then
        send_notification "error" "Restore failed: Backup download error"
        exit 1
    fi
    
    # Decrypt backup files
    if ! decrypt_backup "$restore_path"; then
        send_notification "error" "Restore failed: Decryption error"
        exit 1
    fi
    
    # Verify backup manifest
    if ! verify_manifest "$restore_path"; then
        send_notification "error" "Restore failed: Backup verification error"
        exit 1
    fi
    
    # Confirm restore operation
    confirm_restore
    
    # Create pre-restore backup
    if [[ "$RESTORE_TYPE" == "full" || "$RESTORE_TYPE" == "database-only" ]]; then
        if ! create_pre_restore_backup; then
            log "WARN" "Pre-restore backup failed, continuing with restore"
        fi
    fi
    
    # Perform restore based on type
    case "$RESTORE_TYPE" in
        "full")
            if ! restore_database "$restore_path"; then
                send_notification "error" "Database restore failed"
                exit 1
            fi
            if ! restore_files "$restore_path"; then
                log "WARN" "Files restore failed, but database restore succeeded"
            fi
            ;;
        "database-only")
            if ! restore_database "$restore_path"; then
                send_notification "error" "Database restore failed"
                exit 1
            fi
            ;;
        "files-only")
            if ! restore_files "$restore_path"; then
                send_notification "error" "Files restore failed"
                exit 1
            fi
            ;;
    esac
    
    # Verify database if restored
    if [[ "$RESTORE_TYPE" == "full" || "$RESTORE_TYPE" == "database-only" ]]; then
        if ! verify_database; then
            send_notification "error" "Database verification failed after restore"
            exit 1
        fi
    fi
    
    # Clean up restore directory
    if [[ "$DRY_RUN" != "true" ]]; then
        rm -rf "$restore_path"
        log "INFO" "Cleaned up restore directory: $restore_path"
    fi
    
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    log "INFO" "Restore process completed successfully in ${duration}s"
    send_notification "success" "Database restore completed successfully. Duration: ${duration}s"
}

# Script execution
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    if [[ $# -eq 0 ]]; then
        usage
        exit 1
    fi
    main "$@"
fi