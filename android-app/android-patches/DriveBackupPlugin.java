package com.aray.booth;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.util.Base64;
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
 * ARAY Storage Plugin — Native Android Storage Access Framework (SAF).
 *
 * Port dari Saatiril-Andro DriveBackupManager.kt
 *
 * DUA fungsi utama:
 * 1. LOCAL STORAGE — user pilih folder di HP (internal storage) untuk simpan foto lokal
 *    - pickLocalFolder() → ACTION_OPEN_DOCUMENT_TREE → save URI
 *    - saveLocalFile(base64, filename, subfolder) → DocumentFile.createFile + write
 *    - readLocalFile(filename, subfolder) → read → return base64
 *    - deleteLocalFile(filename, subfolder)
 *
 * 2. GOOGLE DRIVE BACKUP — user pilih folder Google Drive untuk auto-upload
 *    - pickFolder() → ACTION_OPEN_DOCUMENT_TREE → save URI
 *    - uploadFile(localPath, filename, projectName) → DocumentFile.createFile + copy
 *
 * Flow:
 *  1. User tap "Change folder" (Settings) → pickLocalFolder → pilih folder di HP
 *  2. User tap "Connect" (SyncCenter) → pickFolder → pilih folder Google Drive
 *  3. Foto di-capture → saveLocalFile (ke folder lokal) → uploadFile (ke Drive)
 */
@CapacitorPlugin(name = "DriveBackup")
public class DriveBackupPlugin extends Plugin {
    private static final String TAG = "DriveBackupPlugin";
    private static final String PREFS_NAME = "aray_drive_prefs";
    private static final String KEY_DRIVE_URI = "backup_folder_uri";
    private static final String KEY_LOCAL_URI = "local_folder_uri";
    private static final String MIME_JPEG = "image/jpeg";
    private static final String MIME_VIDEO = "video/webm";

    // ════════════════════════════════════════════════════════════════════════
    // LOCAL STORAGE — user picks folder on phone for local photo storage
    // ════════════════════════════════════════════════════════════════════════

    /**
     * Open system folder picker for LOCAL storage.
     * User navigates to any folder on phone (internal storage) → picks it.
     * URI permission persisted so folder remains accessible after reboot.
     */
    @PluginMethod
    public void pickLocalFolder(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION
                | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
                | Intent.FLAG_GRANT_PREFIX_URI_PERMISSION);
        startActivityForResult(call, intent, "handleLocalFolderPick");
    }

    @ActivityCallback
    public void handleLocalFolderPick(PluginCall call, ActivityResult result) {
        if (result.getResultCode() != Activity.RESULT_OK) {
            call.reject("User canceled local folder selection");
            return;
        }
        Uri treeUri = result.getData() != null ? result.getData().getData() : null;
        if (treeUri == null) {
            call.reject("No folder selected");
            return;
        }
        try {
            int flags = Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION;
            getContext().getContentResolver().takePersistableUriPermission(treeUri, flags);
        } catch (SecurityException e) {
            Log.w(TAG, "Could not take persistable permission: " + e.getMessage());
        }
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit().putString(KEY_LOCAL_URI, treeUri.toString()).apply();
        Log.i(TAG, "Local folder set: " + treeUri);

        JSObject ret = new JSObject();
        ret.put("success", true);
        ret.put("uri", treeUri.toString());
        call.resolve(ret);
    }

    @PluginMethod
    public void hasLocalFolder(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String uri = prefs.getString(KEY_LOCAL_URI, null);
        JSObject ret = new JSObject();
        ret.put("hasFolder", uri != null);
        ret.put("uri", uri != null ? uri : "");
        call.resolve(ret);
    }

    @PluginMethod
    public void clearLocalFolder(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String uriStr = prefs.getString(KEY_LOCAL_URI, null);
        if (uriStr != null) {
            try {
                Uri uri = Uri.parse(uriStr);
                int flags = Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION;
                getContext().getContentResolver().releasePersistableUriPermission(uri, flags);
            } catch (Exception e) {
                Log.w(TAG, "Could not release permission: " + e.getMessage());
            }
        }
        prefs.edit().remove(KEY_LOCAL_URI).apply();
        call.resolve();
    }

    /**
     * Save a file (base64 data) to the local storage folder.
     * Mirrors folder structure: root/subfolder/filename
     *
     * @param base64Data  base64-encoded file content (no data: prefix)
     * @param filename    filename to use
     * @param subfolder   subfolder name (event name) — null/empty = save to root
     */
    @PluginMethod
    public void saveLocalFile(PluginCall call) {
        String base64Data = call.getString("base64Data");
        String filename = call.getString("filename");
        String subfolder = call.getString("subfolder", "");
        String mimeType = call.getString("mimeType", MIME_JPEG);

        if (base64Data == null || filename == null) {
            call.reject("base64Data and filename required");
            return;
        }

        SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String treeUriStr = prefs.getString(KEY_LOCAL_URI, null);
        if (treeUriStr == null) {
            call.reject("No local folder set — call pickLocalFolder first");
            return;
        }

        try {
            Uri treeUri = Uri.parse(treeUriStr);
            DocumentFile rootDocFile = DocumentFile.fromTreeUri(getContext(), treeUri);
            if (rootDocFile == null || !rootDocFile.canWrite()) {
                call.reject("Cannot access local folder — may need to re-select");
                return;
            }

            // Determine parent folder (root or subfolder)
            DocumentFile parentFolder = rootDocFile;
            if (subfolder != null && !subfolder.isEmpty()) {
                String sanitizedName = subfolder.replaceAll("[^a-zA-Z0-9_\\-\\s]", "").replaceAll("\\s+", "_");
                if (!sanitizedName.isEmpty()) {
                    DocumentFile existing = rootDocFile.findFile(sanitizedName);
                    if (existing != null && existing.isDirectory()) {
                        parentFolder = existing;
                    } else if (existing == null) {
                        DocumentFile newFolder = rootDocFile.createDirectory(sanitizedName);
                        if (newFolder != null) parentFolder = newFolder;
                    }
                }
            }

            // Create file
            DocumentFile file = parentFolder.createFile(mimeType, filename);
            if (file == null) {
                call.reject("Cannot create file in local folder");
                return;
            }

            // Write base64 data
            byte[] bytes = Base64.decode(base64Data, Base64.DEFAULT);
            OutputStream output = getContext().getContentResolver().openOutputStream(file.getUri());
            if (output == null) {
                call.reject("Cannot open output stream");
                try { file.delete(); } catch (Exception _e) {}
                return;
            }
            output.write(bytes);
            output.flush();
            output.close();

            Log.i(TAG, "saveLocalFile SUCCESS: " + filename + " → " + file.getUri());

            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("path", file.getUri().toString());
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "saveLocalFile FAILED: " + e.getMessage(), e);
            call.reject("Save failed: " + e.getMessage());
        }
    }

    /**
     * Read a file from local storage → return base64.
     *
     * @param path  document URI string (from saveLocalFile return value)
     */
    @PluginMethod
    public void readLocalFile(PluginCall call) {
        String path = call.getString("path");
        if (path == null) {
            call.reject("path required");
            return;
        }
        try {
            Uri uri = Uri.parse(path);
            InputStream input = getContext().getContentResolver().openInputStream(uri);
            if (input == null) {
                call.reject("Cannot open input stream for: " + path);
                return;
            }
            byte[] buffer = new byte[8192];
            int read;
            java.io.ByteArrayOutputStream baos = new java.io.ByteArrayOutputStream();
            while ((read = input.read(buffer)) > 0) {
                baos.write(buffer, 0, read);
            }
            input.close();
            String base64 = Base64.encodeToString(baos.toByteArray(), Base64.NO_WRAP);

            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("data", base64);
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "readLocalFile FAILED: " + e.getMessage(), e);
            call.reject("Read failed: " + e.getMessage());
        }
    }

    /**
     * Delete a file from local storage.
     */
    @PluginMethod
    public void deleteLocalFile(PluginCall call) {
        String path = call.getString("path");
        if (path == null) {
            call.reject("path required");
            return;
        }
        try {
            Uri uri = Uri.parse(path);
            DocumentFile docFile = DocumentFile.fromSingleUri(getContext(), uri);
            if (docFile != null) {
                docFile.delete();
            }
            call.resolve();
        } catch (Exception e) {
            call.reject("Delete failed: " + e.getMessage());
        }
    }

    /**
     * Get the local folder URI (for display in Settings).
     */
    @PluginMethod
    public void getLocalFolderUri(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String uri = prefs.getString(KEY_LOCAL_URI, null);
        JSObject ret = new JSObject();
        ret.put("uri", uri != null ? uri : "");
        ret.put("connected", uri != null);
        call.resolve(ret);
    }

    /**
     * List files in local folder (for storage info / gallery).
     */
    @PluginMethod
    public void listLocalFiles(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String uriStr = prefs.getString(KEY_LOCAL_URI, null);
        if (uriStr == null) {
            JSObject ret = new JSObject();
            ret.put("files", new org.json.JSONArray());
            call.resolve(ret);
            return;
        }
        try {
            Uri treeUri = Uri.parse(uriStr);
            DocumentFile root = DocumentFile.fromTreeUri(getContext(), treeUri);
            org.json.JSONArray filesArray = new org.json.JSONArray();
            if (root != null) {
                for (DocumentFile sub : root.listFiles()) {
                    if (sub.isDirectory()) {
                        for (DocumentFile file : sub.listFiles()) {
                            if (file.isFile()) {
                                JSObject f = new JSObject();
                                f.put("name", file.getName());
                                f.put("uri", file.getUri().toString());
                                f.put("size", file.length());
                                filesArray.put(f);
                            }
                        }
                    }
                }
            }
            JSObject ret = new JSObject();
            ret.put("files", filesArray);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("List failed: " + e.getMessage());
        }
    }

    // ════════════════════════════════════════════════════════════════════════
    // GOOGLE DRIVE BACKUP — user picks folder in Google Drive for auto-upload
    // ════════════════════════════════════════════════════════════════════════

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
        try {
            int flags = Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION;
            getContext().getContentResolver().takePersistableUriPermission(treeUri, flags);
        } catch (SecurityException e) {
            Log.w(TAG, "Could not take persistable permission: " + e.getMessage());
        }
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit().putString(KEY_DRIVE_URI, treeUri.toString()).apply();
        Log.i(TAG, "Drive backup folder set: " + treeUri);

        JSObject ret = new JSObject();
        ret.put("success", true);
        ret.put("uri", treeUri.toString());
        call.resolve(ret);
    }

    @PluginMethod
    public void hasFolder(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String uri = prefs.getString(KEY_DRIVE_URI, null);
        JSObject ret = new JSObject();
        ret.put("hasFolder", uri != null);
        ret.put("uri", uri != null ? uri : "");
        call.resolve(ret);
    }

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
        call.resolve();
    }

    @PluginMethod
    public void getFolderUri(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String uri = prefs.getString(KEY_DRIVE_URI, null);
        JSObject ret = new JSObject();
        ret.put("uri", uri != null ? uri : "");
        ret.put("connected", uri != null);
        call.resolve(ret);
    }

    /**
     * Upload a file to Google Drive backup folder.
     * Reads from local file URI, writes to Drive folder via DocumentFile.
     *
     * @param localPath   document URI of local file (from saveLocalFile return)
     * @param filename    filename to use in Drive
     * @param projectName subfolder name (event name)
     * @param mimeType    "image/jpeg" or "video/webm"
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
            call.reject("No Drive backup folder set");
            return;
        }

        try {
            Uri treeUri = Uri.parse(treeUriStr);
            DocumentFile rootDocFile = DocumentFile.fromTreeUri(getContext(), treeUri);
            if (rootDocFile == null || !rootDocFile.canWrite()) {
                call.reject("Cannot access Drive folder — may need to re-connect");
                return;
            }

            // Create project subfolder (mirrors local structure)
            DocumentFile parentFolder = rootDocFile;
            if (projectName != null && !projectName.isEmpty()) {
                String sanitizedName = projectName.replaceAll("[^a-zA-Z0-9_\\-\\s]", "").replaceAll("\\s+", "_");
                if (!sanitizedName.isEmpty()) {
                    DocumentFile existing = rootDocFile.findFile(sanitizedName);
                    if (existing != null && existing.isDirectory()) {
                        parentFolder = existing;
                    } else if (existing == null) {
                        DocumentFile newFolder = rootDocFile.createDirectory(sanitizedName);
                        if (newFolder != null) parentFolder = newFolder;
                    }
                }
            }

            // Create file in Drive folder
            DocumentFile driveFile = parentFolder.createFile(mimeType, filename);
            if (driveFile == null) {
                call.reject("Cannot create file in Drive folder");
                return;
            }

            // Copy bytes: local file → Drive document
            Uri localUri = Uri.parse(localPath);
            InputStream input = getContext().getContentResolver().openInputStream(localUri);
            OutputStream output = getContext().getContentResolver().openOutputStream(driveFile.getUri());

            if (input == null || output == null) {
                call.reject("Cannot open streams");
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

            Log.i(TAG, "Upload SUCCESS: " + filename + " → " + driveFile.getUri());

            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("driveUri", driveFile.getUri().toString());
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "Upload FAILED: " + e.getMessage(), e);
            call.reject("Upload failed: " + e.getMessage());
        }
    }
}
