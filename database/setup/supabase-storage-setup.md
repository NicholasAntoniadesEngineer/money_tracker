# Supabase Storage Setup

This document describes the Supabase Storage buckets required for the application.

## Required Buckets

### 1. `message-attachments`

**Purpose**: Stores encrypted file attachments for messages.

**Configuration**:
- **Name**: `message-attachments`
- **Public**: No (private bucket)
- **File size limit**: 1MB (1048576 bytes)
- **Allowed MIME types**: Not restricted (files are encrypted client-side)

**Setup Steps**:
1. Go to your Supabase dashboard
2. Navigate to **Storage** in the left sidebar
3. Click **New bucket**
4. Enter `message-attachments` as the bucket name
5. Keep **Public bucket** unchecked (private)
6. Click **Create bucket**

**RLS Policies** (apply in SQL Editor):
```sql
-- Allow authenticated users to upload to their conversation folders
CREATE POLICY "Users can upload attachments"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'message-attachments'
);

-- Allow authenticated users to read attachments from their conversations
CREATE POLICY "Users can read attachments"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'message-attachments'
);

-- Allow users to delete their own uploads
CREATE POLICY "Users can delete own attachments"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'message-attachments'
);
```

## Verification

After setup, the application will log the following on successful detection:
```
[AttachmentService] ✓ Storage bucket 'message-attachments' is accessible
```

If the bucket is missing, you'll see:
```
[AttachmentService] ✗ Storage bucket 'message-attachments' not found - file attachments disabled
```

## File Retention

Files in `message-attachments` are automatically deleted after 24 hours via a database trigger on the `message_attachments` table. See `fresh-install-complete.sql` for the cleanup function.
