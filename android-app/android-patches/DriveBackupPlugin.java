package com.aray.booth;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.util.Log;
import androidx.activity.result.ActivityResult;
import androidx.documentfile.provider.DocumentFile;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.InputStream;
import java.io.OutputStream;

/**
 * ARAY Drive Backup Plugin — Native Android Storage Access Framework (SAF).
 *
 * Port dari Saatiril-Andro DriveBackupManager.kt
 * (https://github.com/synclicen/Saatiril-Andro)
 *
 * HOW IT WORKS:
 *  1. Admin taps "Connect Google Drive" → SAF folder picker opens (ACTION_OPEN_DOCUMENT_TREE)
 *  2. Admin navigates to Google Drive → picks/creates a folder
 *  3. We persist the URI permission (survives reboots via takePersistableUriPermission)
 *  4. For each photo saved locally, auto-upload:
 *     a. Get tree URI from SharedPreferences
 *     b. DocumentFile.fromTreeUri → root folder
 *     c. Create project subfolder (mirrors local: root/projectName/file.jpg)
 *     d. createFile("image/jpeg", filename) → document URI
 *     e. Open input stream from local file, output stream from Drive document
 *     f. Copy bytes — Google Drive app syncs to cloud (async, built-in retry)
 *
 * ADVANTAGES (vs OAuth REST API):
 *  - No Google Cloud Project / OAuth / API key needed
 *  - Upload via Google Drive app's sync mechanism (battle-tested, offline-capable)
 *  - Admin can pick ANY cloud provider (Drive, Dropbox, OneDrive) — not just Drive
 */
@CapacitorPlugin(name = "DriveBackup")
public class DriveBackupPlugin extends Plugin {
    private static final String TAG = "DriveBackupPlugin";
    private static final String PREFS_NAME = "aray_drive_prefs";
    private static final String KEY_DRIVE_URI = "backup_folder_uri";
    private static final String MIME_JPEG = "image/jpeg";
    private static final String MIME_VIDEO = "video/webm";

    /**
     * Open system folder picker (ACTION_OPEN_DOCUMENT_TREE).
     * User navigates to Google Drive (or any cloud) → picks/creates folder.
     * URI permission persisted so folder remains accessible after reboot.
     */
    @PluginMethod
    public void pickFolder(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION
                | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
                | Intent.FLAG_GRANT_PREFIX_URI_PERMISSION);
        startActivityForResult(call, intent, "handleFolderPick");
    }

    @ActivityCallback
    public void handleFolderPick(PluginCall call, ActivityResult result) {
        if (result.getResultCode() != Activity.RESULT_OK) {
            call.reject("User canceled folder selection");
            return;
        }
        Uri treeUri = result.getData() != null ? result.getData().getData() : null;
        if (treeUri == null) {
            call.reject("No folder selected");
            return;
        }
        // Take persistable permission — critical for surviving reboot
        try {
            int flags = Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION;
            getContext().getContentResolver().takePersistableUriPermission(treeUri, flags);
        } catch (SecurityException e) {
            Log.w(TAG, "Could not take persistable permission: " + e.getMessage());
        }
        // Save URI to SharedPreferences
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit().putString(KEY_DRIVE_URI, treeUri.toString()).apply();
        Log.i(TAG, "Backup folder set: " + treeUri);

        JSObject ret = new JSObject();
        ret.put("success", true);
        ret.put("uri", treeUri.toString());
        call.resolve(ret);
    }

    /**
     * Check if a backup folder has been configured.
     */
    @PluginMethod
    public void hasFolder(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String uri = prefs.getString(KEY_DRIVE_URI, null);
        JSObject ret = new JSObject();
        ret.put("hasFolder", uri != null);
        ret.put("uri", uri != null ? uri : "");
        call.resolve(ret);
    }

    /**
     * Clear the backup folder (disconnect).
     */
    @PluginMethod
    public void clearFolder(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String uriStr = prefs.getString(KEY_DRIVE_URI, null);
        if (uriStr != null) {
            try {
                Uri uri = Uri.parse(uriStr);
                int flags = Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION;
                getContext().getContentResolver().releasePersistableUriPermission(uri, flags);
            } catch (Exception e) {
                Log.w(TAG, "Could not release permission: " + e.getMessage());
            }
        }
        prefs.edit().remove(KEY_DRIVE_URI).apply();
        Log.i(TAG, "Backup folder cleared");
        call.resolve();
    }

    /**
     * Upload a single file to the backup folder.
     * Mirrors local folder structure: root/projectName/filename
     *
     * @param localPath  file:// URI from Capacitor Filesystem (e.g. file:///storage/emulated/0/Documents/ARAY/event123/photo.jpg)
     * @param filename   filename to use in Drive folder
     * @param projectName subfolder name (event name) — mirrors local structure
     * @param mimeType   "image/jpeg" or "video/webm"
     */
    @PluginMethod
    public void uploadFile(PluginCall call) {
        String localPath = call.getString("localPath");
        String filename = call.getString("filename");
        String projectName = call.getString("projectName", "default");
        String mimeType = call.getString("mimeType", MIME_JPEG);

        if (localPath == null || filename == null) {
            call.reject("localPath and filename required");
            return;
        }

        SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String treeUriStr = prefs.getString(KEY_DRIVE_URI, null);
        if (treeUriStr == null) {
            call.reject("No backup folder set");
            return;
        }

        try {
            Uri treeUri = Uri.parse(treeUriStr);
            DocumentFile rootDocFile = DocumentFile.fromTreeUri(getContext(), treeUri);
            if (rootDocFile == null) {
                call.reject("Cannot access backup folder — may need to re-connect");
                return;
            }
            if (!rootDocFile.canWrite()) {
                call.reject("Backup folder is not writable — check permissions");
                return;
            }

            // Sanitize project name (same logic as Saatiril-Andro)
            String sanitizedName = projectName.replaceAll("[^a-zA-Z0-9_\\-\\s]", "").replaceAll("\\s+", "_");
            DocumentFile parentFolder = rootDocFile;

            if (sanitizedName != null && !sanitizedName.isEmpty()) {
                // Check if subfolder already exists
                DocumentFile existing = rootDocFile.findFile(sanitizedName);
                if (existing != null && existing.isDirectory()) {
                    parentFolder = existing;
                    Log.i(TAG, "Using existing subfolder: " + sanitizedName);
                } else if (existing == null) {
                    // Create new subfolder
                    DocumentFile newFolder = rootDocFile.createDirectory(sanitizedName);
                    if (newFolder != null) {
                        parentFolder = newFolder;
                        Log.i(TAG, "Created subfolder: " + sanitizedName);
                    } else {
                        Log.w(TAG, "Could not create subfolder — uploading to root");
                    }
                } else {
                    Log.w(TAG, "File with subfolder name exists — uploading to root");
                }
            }

            // Create the file in Drive folder
            DocumentFile driveFile = parentFolder.createFile(mimeType, filename);
            if (driveFile == null) {
                call.reject("Cannot create file in Drive folder — createFile returned null");
                return;
            }

            // Copy bytes: local file → Drive document
            Uri localUri = Uri.parse(localPath);
            InputStream input = getContext().getContentResolver().openInputStream(localUri);
            OutputStream output = getContext().getContentResolver().openOutputStream(driveFile.getUri());

            if (input == null || output == null) {
                call.reject("Cannot open streams — input=" + (input != null) + " output=" + (output != null));
                try { driveFile.delete(); } catch (Exception _e) {}
                return;
            }

            byte[] buffer = new byte[8192];
            int read;
            while ((read = input.read(buffer)) > 0) {
                output.write(buffer, 0, read);
            }
            output.flush();
            input.close();
            output.close();

            Log.i(TAG, "Upload SUCCESS: " + filename + " → " + driveFile.getUri() + " (project=" + projectName + ")");

            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("driveUri", driveFile.getUri().toString());
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "Upload FAILED for " + filename + ": " + e.getMessage(), e);
            call.reject("Upload failed: " + e.getMessage());
        }
    }

    /**
     * Get the backup folder URI string (for display in Settings).
     */
    @PluginMethod
    public void getFolderUri(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String uri = prefs.getString(KEY_DRIVE_URI, null);
        JSObject ret = new JSObject();
        ret.put("uri", uri != null ? uri : "");
        ret.put("connected", uri != null);
        call.resolve(ret);
    }
}
