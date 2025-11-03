# delete-from-bucket

This action deletes a directory from a GCP bucket, optionally removing stale entries.

## Usage
This action will log in to GCP using Workload Identity Federation mechanism.

### Inputs
- `date` - directory name prefix
- `namespace` - directory name suffix
- `bucket_name` - GCS bucket where the files will be uploaded, without gs:// or trailing slash
- `service_account` - Service account used for upload
- `workload_identity_provider` - Workload Identity Provider used for authentication

## Testing
Please use _99. Test 'upload-to-bucket' action_ to verify your code changes don't break anything.

## Version history

### 1.0.2
Initial release