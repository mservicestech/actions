# upload-to-bucket

This action takes a folder and uploads it to a GCP bucket. All the files are uploaded to a folder having
the creation date in its name.

It returns the URL of uploaded folder.

Optionally, it can delete folders that are older than specified time.

## Usage
This action will log in to GCP using Workload Identity Federation mechanism.

### Inputs
- `path` - What to upload. Path contents will be uploaded, not the path literally
- `namespace` - A part of directory name where the files will be uploaded, e.g. 20250925-123456_namespace
- `bucket_name` - GCS bucket where the files will be uploaded, without gs:// or trailing slash
- `service_account` - Service account used for upload
- `workload_identity_provider` - Workload Identity Provider used for authentication
- `delete_older_than` - if set, directories of this namespace older than delete_older_than days will be deleted

### Outputs
- `path` - Where the files have been uploaded, ends with a trailing slash. 
This is not a URL, it contains neither protocol nor domain. 

## Testing
Please use _99. Test 'upload-to-bucket' action_ to verify your code changes don't break anything.

## Version history

### 1.0.0
Initial release