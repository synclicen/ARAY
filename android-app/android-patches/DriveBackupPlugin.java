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
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.InputStream;
import java.io.OutputStream;

/**
 * ARAY Storage Plugin — Native Android Storage Access Framework (SAF).
 *
 * Port dari Saatiril-Andro DriveBackupManager.kt
 *
 * DUA fungsi utama:
 * 1. LOCAL STORAGE — user pilih folder di HP untuk simpan foto lokal
 * 2. GOOGLE DRIVE BACKUP — user pilih folder Google Drive untuk auto-upload
 *
 * v4.7.6: Folder structure match Electron — Events/<EventName>/Photos/ dan Videos/
 * v4.7.6: Upload queue dengan retry — failed uploads di-retry otomatis
 */
@CapacitorPlugin(name = "DriveBackup")
public class DriveBackupPlugin extends Plugin {
    private static final String TAG = "DriveBackupPlugin";
    private static final String PREFS_NAME = "aray_drive_prefs";
    private static final String KEY_DRIVE_URI = "backup_folder_uri";
    private static final String KEY_LOCAL_URI = "local_folder_uri";
    private static final String KEY_UPLOAD_QUEUE = "upload_queue";
    private static final String MIME_JPEG = "image/jpeg";
    private static final String MIME_VIDEO = "video/webm";

    // ════════════════════════════════════════════════════════════════════════
    // LOCAL STORAGE
    // ════════════════════════════════════════════════════════════════════════

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

            // v4.7.6: Structure match Electron — Events/<EventName>/Photos/ or Videos/
            DocumentFile parentFolder = rootDocFile;
            if (subfolder != null && !subfolder.isEmpty()) {
                String sanitizedName = subfolder.replaceAll("[^a-zA-Z0-9_\\-\\s]", "").replaceAll("\\s+", "_");
                if (!sanitizedName.isEmpty()) {
                    // Create Events/ subfolder
                    DocumentFile eventsFolder = rootDocFile.findFile("Events");
                    if (eventsFolder == null || !eventsFolder.isDirectory()) {
                        eventsFolder = rootDocFile.createDirectory("Events");
                    }
                    if (eventsFolder != null) {
                        // Create Events/<EventName>/ subfolder
                        DocumentFile eventFolder = eventsFolder.findFile(sanitizedName);
                        if (eventFolder == null || !eventFolder.isDirectory()) {
                            eventFolder = eventsFolder.createDirectory(sanitizedName);
                        }
                        if (eventFolder != null) {
                            // Create Events/<EventName>/Photos/ or Videos/ subfolder
                            String typeSubfolder = mimeType.startsWith("video/") ? "Videos" : "Photos";
                            DocumentFile typeFolder = eventFolder.findFile(typeSubfolder);
                            if (typeFolder == null || !typeFolder.isDirectory()) {
                                typeFolder = eventFolder.createDirectory(typeSubfolder);
                            }
                            if (typeFolder != null) {
                                parentFolder = typeFolder;
                            }
                        }
                    }
                }
            }

            DocumentFile file = parentFolder.createFile(mimeType, filename);
            if (file == null) {
                call.reject("Cannot create file in local folder");
                return;
            }

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

    @PluginMethod
    public void getLocalFolderUri(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String uri = prefs.getString(KEY_LOCAL_URI, null);
        JSObject ret = new JSObject();
        ret.put("uri", uri != null ? uri : "");
        ret.put("connected", uri != null);
        call.resolve(ret);
    }

    @PluginMethod
    public void listLocalFiles(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String uriStr = prefs.getString(KEY_LOCAL_URI, null);
        if (uriStr == null) {
            JSObject ret = new JSObject();
            ret.put("files", new JSONArray());
            call.resolve(ret);
            return;
        }
        try {
            Uri treeUri = Uri.parse(uriStr);
            DocumentFile root = DocumentFile.fromTreeUri(getContext(), treeUri);
            JSONArray filesArray = new JSONArray();
            if (root != null) {
                listFilesRecursive(root, filesArray);
            }
            JSObject ret = new JSObject();
            ret.put("files", filesArray);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("List failed: " + e.getMessage());
        }
    }

    private void listFilesRecursive(DocumentFile folder, JSONArray filesArray) {
        if (folder == null) return;
        for (DocumentFile file : folder.listFiles()) {
            if (file.isDirectory()) {
                listFilesRecursive(file, filesArray);
            } else if (file.isFile()) {
                try {
                    JSONObject f = new JSONObject();
                    f.put("name", file.getName());
                    f.put("uri", file.getUri().toString());
                    f.put("size", file.length());
                    filesArray.put(f);
                } catch (Exception e) {
                    Log.w(TAG, "listFilesRecursive: " + e.getMessage());
                }
            }
        }
    }

    // ════════════════════════════════════════════════════════════════════════
    // GOOGLE DRIVE BACKUP — with upload queue + retry
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
     * v4.7.6: Enqueue upload — simpan ke persistent queue, return immediately.
     * Upload akan di-process oleh processNextUpload() yang dipanggil secara periodic.
     * Queue survive app restart (SharedPreferences).
     *
     * @param localPath   document URI of local file
     * @param filename    filename to use in Drive
     * @param projectName event name (for subfolder)
     * @param mimeType    "image/jpeg" or "video/webm"
     * @param mediaId     unique ID for tracking (stored in queue)
     */
    @PluginMethod
    public void enqueueUpload(PluginCall call) {
        String localPath = call.getString("localPath");
        String filename = call.getString("filename");
        String projectName = call.getString("projectName", "default");
        String mimeType = call.getString("mimeType", MIME_JPEG);
        String mediaId = call.getString("mediaId", "");

        if (localPath == null || filename == null) {
            call.reject("localPath and filename required");
            return;
        }

        try {
            SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            String queueStr = prefs.getString(KEY_UPLOAD_QUEUE, "[]");
            JSONArray queue = new JSONArray(queueStr);

            JSONObject item = new JSONObject();
            item.put("id", mediaId != null && !mediaId.isEmpty() ? mediaId : "upload_" + System.currentTimeMillis());
            item.put("localPath", localPath);
            item.put("filename", filename);
            item.put("projectName", projectName);
            item.put("mimeType", mimeType);
            item.put("status", "PENDING");
            item.put("attempts", 0);
            item.put("lastError", "");
            item.put("createdAt", System.currentTimeMillis());

            queue.put(item);
            prefs.edit().putString(KEY_UPLOAD_QUEUE, queue.toString()).apply();

            Log.i(TAG, "Enqueued upload: " + filename + " (queue size: " + queue.length() + ")");

            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("queueSize", queue.length());
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "enqueueUpload FAILED: " + e.getMessage(), e);
            call.reject("Enqueue failed: " + e.getMessage());
        }
    }

    /**
     * v4.7.6: Process next upload from queue. Called periodically by JS.
     * Returns: { processed: true/false, success: true/false, filename, error, queueSize }
     */
    @PluginMethod
    public void processNextUpload(PluginCall call) {
        try {
            SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            String queueStr = prefs.getString(KEY_UPLOAD_QUEUE, "[]");
            JSONArray queue = new JSONArray(queueStr);

            // Find next PENDING item
            int nextIdx = -1;
            for (int i = 0; i < queue.length(); i++) {
                JSONObject item = queue.getJSONObject(i);
                if ("PENDING".equals(item.getString("status"))) {
                    nextIdx = i;
                    break;
                }
            }

            if (nextIdx == -1) {
                JSObject ret = new JSObject();
                ret.put("processed", false);
                ret.put("queueSize", queue.length());
                call.resolve(ret);
                return;
            }

            JSONObject item = queue.getJSONObject(nextIdx);
            String localPath = item.getString("localPath");
            String filename = item.getString("filename");
            String projectName = item.getString("projectName");
            String mimeType = item.getString("mimeType");
            int attempts = item.optInt("attempts", 0);

            // Mark as UPLOADING
            item.put("status", "UPLOADING");
            item.put("attempts", attempts + 1);
            queue.put(nextIdx, item);
            prefs.edit().putString(KEY_UPLOAD_QUEUE, queue.toString()).apply();

            // Attempt upload
            boolean success = doUpload(localPath, filename, projectName, mimeType);

            if (success) {
                // Remove from queue on success
                JSONArray newQueue = new JSONArray();
                for (int i = 0; i < queue.length(); i++) {
                    if (i != nextIdx) newQueue.put(queue.get(i));
                }
                prefs.edit().putString(KEY_UPLOAD_QUEUE, newQueue.toString()).apply();

                JSObject ret = new JSObject();
                ret.put("processed", true);
                ret.put("success", true);
                ret.put("filename", filename);
                ret.put("queueSize", newQueue.length());
                call.resolve(ret);
            } else {
                // Mark as FAILED — will be retried by next processNextUpload call
                item.put("status", "PENDING");
                item.put("lastError", "Upload failed");
                queue.put(nextIdx, item);
                prefs.edit().putString(KEY_UPLOAD_QUEUE, queue.toString()).apply();

                JSObject ret = new JSObject();
                ret.put("processed", true);
                ret.put("success", false);
                ret.put("filename", filename);
                ret.put("error", "Upload failed");
                ret.put("queueSize", queue.length());
                call.resolve(ret);
            }
        } catch (Exception e) {
            Log.e(TAG, "processNextUpload FAILED: " + e.getMessage(), e);
            call.reject("Process failed: " + e.getMessage());
        }
    }

    /**
     * Core upload logic — creates Events/<EventName>/Photos|Videos/<filename> structure.
     * Match Electron: {backupFolder}/Events/{EventName}/Photos/<filename>
     */
    private boolean doUpload(String localPath, String filename, String projectName, String mimeType) {
        try {
            SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            String treeUriStr = prefs.getString(KEY_DRIVE_URI, null);
            if (treeUriStr == null) {
                Log.e(TAG, "doUpload: no Drive folder set");
                return false;
            }

            Uri treeUri = Uri.parse(treeUriStr);
            DocumentFile rootDocFile = DocumentFile.fromTreeUri(getContext(), treeUri);
            if (rootDocFile == null || !rootDocFile.canWrite()) {
                Log.e(TAG, "doUpload: cannot access Drive folder");
                return false;
            }

            // v4.7.6: Create Events/ subfolder (match Electron structure)
            DocumentFile eventsFolder = rootDocFile.findFile("Events");
            if (eventsFolder == null || !eventsFolder.isDirectory()) {
                eventsFolder = rootDocFile.createDirectory("Events");
            }
            if (eventsFolder == null) {
                Log.e(TAG, "doUpload: cannot create Events folder");
                return false;
            }

            // Create Events/<EventName>/ subfolder
            String sanitizedName = projectName.replaceAll("[^a-zA-Z0-9_\\-\\s]", "").replaceAll("\\s+", "_");
            if (sanitizedName.isEmpty()) sanitizedName = "default";

            DocumentFile eventFolder = eventsFolder.findFile(sanitizedName);
            if (eventFolder == null || !eventFolder.isDirectory()) {
                eventFolder = eventsFolder.createDirectory(sanitizedName);
            }
            if (eventFolder == null) {
                Log.e(TAG, "doUpload: cannot create event folder: " + sanitizedName);
                return false;
            }

            // Create Events/<EventName>/Photos/ or Videos/ subfolder (match Electron)
            String typeSubfolder = mimeType.startsWith("video/") ? "Videos" : "Photos";
            DocumentFile typeFolder = eventFolder.findFile(typeSubfolder);
            if (typeFolder == null || !typeFolder.isDirectory()) {
                typeFolder = eventFolder.createDirectory(typeSubfolder);
            }
            if (typeFolder == null) {
                Log.e(TAG, "doUpload: cannot create " + typeSubfolder + " folder");
                return false;
            }

            // Create file in Drive folder
            DocumentFile driveFile = typeFolder.createFile(mimeType, filename);
            if (driveFile == null) {
                Log.e(TAG, "doUpload: createFile returned null for " + filename);
                return false;
            }

            // Copy bytes: local file → Drive document
            Uri localUri = Uri.parse(localPath);
            InputStream input = getContext().getContentResolver().openInputStream(localUri);
            OutputStream output = getContext().getContentResolver().openOutputStream(driveFile.getUri());

            if (input == null || output == null) {
                Log.e(TAG, "doUpload: cannot open streams");
                try { driveFile.delete(); } catch (Exception _e) {}
                return false;
            }

            byte[] buffer = new byte[8192];
            int read;
            while ((read = input.read(buffer)) > 0) {
                output.write(buffer, 0, read);
            }
            output.flush();
            input.close();
            output.close();

            Log.i(TAG, "doUpload SUCCESS: " + filename + " → Events/" + sanitizedName + "/" + typeSubfolder + "/");
            return true;
        } catch (Exception e) {
            Log.e(TAG, "doUpload FAILED: " + e.getMessage(), e);
            return false;
        }
    }

    /**
     * Get upload queue stats — for SyncCenter UI.
     */
    @PluginMethod
    public void getUploadStats(PluginCall call) {
        try {
            SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            String queueStr = prefs.getString(KEY_UPLOAD_QUEUE, "[]");
            JSONArray queue = new JSONArray(queueStr);

            int pending = 0, uploading = 0, failed = 0;
            for (int i = 0; i < queue.length(); i++) {
                JSONObject item = queue.getJSONObject(i);
                String status = item.getString("status");
                if ("PENDING".equals(status)) {
                    int attempts = item.optInt("attempts", 0);
                    if (attempts > 0) failed++;
                    else pending++;
                } else if ("UPLOADING".equals(status)) {
                    uploading++;
                }
            }

            JSObject ret = new JSObject();
            ret.put("queueSize", queue.length());
            ret.put("pending", pending);
            ret.put("uploading", uploading);
            ret.put("failed", failed);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Stats failed: " + e.getMessage());
        }
    }

    /**
     * Retry all failed uploads — set status back to PENDING.
     */
    @PluginMethod
    public void retryAllFailed(PluginCall call) {
        try {
            SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            String queueStr = prefs.getString(KEY_UPLOAD_QUEUE, "[]");
            JSONArray queue = new JSONArray(queueStr);

            int reset = 0;
            for (int i = 0; i < queue.length(); i++) {
                JSONObject item = queue.getJSONObject(i);
                String status = item.getString("status");
                if ("PENDING".equals(status) && item.optInt("attempts", 0) > 0) {
                    item.put("status", "PENDING");
                    item.put("attempts", 0);
                    item.put("lastError", "");
                    queue.put(i, item);
                    reset++;
                }
            }
            prefs.edit().putString(KEY_UPLOAD_QUEUE, queue.toString()).apply();

            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("reset", reset);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Retry failed: " + e.getMessage());
        }
    }

    /**
     * Remove an item from queue by mediaId (after successful upload from JS side).
     */
    @PluginMethod
    public void removeFromQueue(PluginCall call) {
        String mediaId = call.getString("mediaId");
        if (mediaId == null) {
            call.reject("mediaId required");
            return;
        }
        try {
            SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            String queueStr = prefs.getString(KEY_UPLOAD_QUEUE, "[]");
            JSONArray queue = new JSONArray(queueStr);

            JSONArray newQueue = new JSONArray();
            for (int i = 0; i < queue.length(); i++) {
                JSONObject item = queue.getJSONObject(i);
                if (!mediaId.equals(item.optString("id", ""))) {
                    newQueue.put(item);
                }
            }
            prefs.edit().putString(KEY_UPLOAD_QUEUE, newQueue.toString()).apply();
            call.resolve();
        } catch (Exception e) {
            call.reject("Remove failed: " + e.getMessage());
        }
    }
}
